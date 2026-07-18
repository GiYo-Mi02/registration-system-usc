import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { supabase } from "./db";
import { QR_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD } from "./config";
import {
  authenticateToken,
  requireAdmin,
  requireCommitteeOrAdmin,
  loginLimiter
} from "./middleware";
import {
  escapeHTML,
  generateEmailTemplate,
  sendEmail
} from "./helpers";

const router = express.Router();

// Real-time server-sent events client pool
let sseClients: express.Response[] = [];

export function notifyClients(type: string, data: any) {
  const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      // client connection closed already
    }
  });
}

// Inactivity session cleaner (helper to run periodically)
async function cleanupSessions() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // Fetch expired sessions
    const { data: expired } = await supabase
      .from("committee_sessions")
      .select("session_token")
      .lt("last_heartbeat", fiveMinutesAgo);

    if (expired && expired.length > 0) {
      const tokens = expired.map(s => s.session_token);
      await supabase.from("committee_sessions").delete().in("session_token", tokens);

      const { count } = await supabase
        .from("committee_sessions")
        .select("*", { count: "exact", head: true });

      notifyClients("session_update", { active_sessions: count || 0 });
    }
  } catch (err) {
    console.error("Session cleanup error:", err);
  }
}

// Clean sessions periodically - only in long-lived processes (not Vercel serverless)
// On Vercel, PORT is not set; cleanup runs as a one-shot on-demand instead.
const IS_SERVERLESS = !process.env.PORT;
if (!IS_SERVERLESS) {
  setInterval(cleanupSessions, 60000);
}

// --- SSE ROUTE ---
router.get("/api/live-updates", async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(401).json({ success: false, message: "Token required for live updates" });
  }

  try {
    const { data: session } = await supabase
      .from("committee_sessions")
      .select("id")
      .eq("session_token", token)
      .maybeSingle();

    if (!session) {
      return res.status(401).json({ success: false, message: "Invalid session token" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const { count: sessionCount } = await supabase
      .from("committee_sessions")
      .select("*", { count: "exact", head: true });

    res.write(`data: ${JSON.stringify({ type: "connected", data: { active_sessions: sessionCount || 1 } })}\n\n`);

    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Live updates setup failed" });
  }
});

// --- HEARTBEAT ROUTER ---
router.post(["/api/auth/heartbeat", "/api/heartbeat"], authenticateToken, async (req, res) => {
  const token = req.headers.authorization?.substring(7);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authorization token required." });
  }

  try {
    const { data: session } = await supabase
      .from("committee_sessions")
      .select("id")
      .eq("session_token", token)
      .maybeSingle();

    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired or invalid." });
    }

    const { error } = await supabase
      .from("committee_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("session_token", token);

    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error("Heartbeat local route error:", err);
    return res.status(500).json({ success: false, message: "Failed to update heartbeat." });
  }
});

// --- AUTH ROUTER ---
router.post(["/api/auth/login", "/api/login"], loginLimiter, async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: "Username, password, and role are required" });
  }

  try {
    // On serverless (Vercel), run a one-shot session cleanup since setInterval is not available
    if (IS_SERVERLESS) {
      cleanupSessions().catch(() => {});
    }

    if (role === "admin") {
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: "Invalid administrator credentials" });
      }

      const sessionToken = `sess_adm_${crypto.randomBytes(16).toString("hex")}`;
      await supabase.from("committee_sessions").insert({
        id: `sess_adm_${Date.now()}`,
        committee_user_id: "admin-id",
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });

      const { count } = await supabase
        .from("committee_sessions")
        .select("*", { count: "exact", head: true });

      notifyClients("session_update", { active_sessions: count || 1 });

      return res.json({
        success: true,
        token: sessionToken,
        user: { id: "admin-id", username: ADMIN_USERNAME, committee_name: "Admin Dashboard Console" },
        role: "admin"
      });
    }

    if (role === "committee") {
      console.log(`[AUTH DEBUG] Scanner login attempt: username=${username}`);
      const { data: user, error } = await supabase
        .from("committee_users")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if (error) {
        console.error("[AUTH DEBUG] Supabase query error:", error);
        return res.status(401).json({ success: false, message: "Database lookup failed." });
      }

      if (!user) {
        console.warn(`[AUTH DEBUG] Scanner user not found in DB: username=${username}`);
        return res.status(401).json({ success: false, message: "Invalid scanner credentials or inactive account" });
      }

      console.log(`[AUTH DEBUG] Found user in DB:`, user);
      if (!user.active) {
        console.warn(`[AUTH DEBUG] User is inactive: username=${username}`);
        return res.status(401).json({ success: false, message: "Invalid scanner credentials or inactive account" });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      console.log(`[AUTH DEBUG] Password validation outcome for ${username}: ${match}`);
      if (!match) {
        return res.status(401).json({ success: false, message: "Invalid scanner credentials" });
      }

      const sessionToken = `sess_com_${crypto.randomBytes(16).toString("hex")}`;
      await supabase.from("committee_sessions").insert({
        id: `sess_com_${Date.now()}`,
        committee_user_id: user.id,
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });

      const { count } = await supabase
        .from("committee_sessions")
        .select("*", { count: "exact", head: true });

      notifyClients("session_update", { active_sessions: count || 1 });

      return res.json({
        success: true,
        token: sessionToken,
        user: { id: user.id, username: user.username, committee_name: user.committee_name },
        role: "committee"
      });
    }

    return res.status(400).json({ success: false, message: "Unsupported console role login request" });
  } catch (err: any) {
    console.error("Login route error:", err);
    return res.status(500).json({ success: false, message: `Internal server error logging in: ${err?.message || String(err)}` });
  }
});

router.post("/api/auth/logout", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: "Session token is required" });

  try {
    await supabase.from("committee_sessions").delete().eq("session_token", token);
    
    const { count } = await supabase
      .from("committee_sessions")
      .select("*", { count: "exact", head: true });

    notifyClients("session_update", { active_sessions: count || 0 });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
});

router.post("/api/auth/heartbeat", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: "Token required" });

  try {
    const { data: session } = await supabase
      .from("committee_sessions")
      .select("id")
      .eq("session_token", token)
      .maybeSingle();

    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired or invalid" });
    }

    await supabase
      .from("committee_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("session_token", token);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Heartbeat failed" });
  }
});

// --- EVENTS CRUD ROUTER ---
router.get("/api/events", authenticateToken, async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ success: true, events });
  } catch (err: any) {
    console.error("Fetch events error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch events." });
  }
});

router.post("/api/events", authenticateToken, requireAdmin, async (req, res) => {
  const { name, event_date, description, venue, banner_url } = req.body;
  if (!name || !event_date || !description || !venue || !banner_url) {
    return res.status(400).json({ success: false, message: "Please fill in all event details." });
  }

  try {
    const { data: newEvent, error } = await supabase
      .from("events")
      .insert({
        name,
        event_date,
        description,
        venue,
        banner_url
      })
      .select("*")
      .single();

    if (error) throw error;

    notifyClients("event_created", { event: newEvent });
    return res.json({ success: true, event: newEvent });
  } catch (err: any) {
    console.error("Create event error:", err);
    return res.status(500).json({ success: false, message: "Failed to create event." });
  }
});

router.put(["/api/events/:id", "/api/events"], authenticateToken, requireAdmin, async (req, res) => {
  const eventId = req.params.id || (req.query.id as string);
  const { name, event_date, description, venue, banner_url } = req.body;
  if (!name || !event_date || !description || !venue || !banner_url) {
    return res.status(400).json({ success: false, message: "Please fill in all event details." });
  }

  try {
    const { data: updatedEvent, error } = await supabase
      .from("events")
      .update({
        name,
        event_date,
        description,
        venue,
        banner_url
      })
      .eq("id", eventId)
      .select("*")
      .single();

    if (error) throw error;

    notifyClients("event_updated", { event: updatedEvent });
    return res.json({ success: true, event: updatedEvent });
  } catch (err: any) {
    console.error("Update event error:", err);
    return res.status(500).json({ success: false, message: "Failed to update event." });
  }
});

router.delete(["/api/events/:id", "/api/events"], authenticateToken, requireAdmin, async (req, res) => {
  const eventId = req.params.id || (req.query.id as string);
  try {
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId);

    if (error) throw error;

    notifyClients("event_deleted", { id: eventId });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Delete event error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete event." });
  }
});

// --- STUDENTS ROUTER ---
router.get("/api/students", authenticateToken, async (req, res, next) => {
  const isDeveloperMode = process.env.NODE_ENV !== "production";
  if (req.user?.role !== "admin" && !isDeveloperMode) {
    return res.status(403).json({ success: false, message: "Access denied: Administrator role required" });
  }
  next();
}, async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = (req.query.search as string || "").toLowerCase();
  const collegeFilter = req.query.college as string || "";
  const attendanceFilter = req.query.attendance as string || "";
  const emailStatusFilter = req.query.emailStatus as string || "";
  const eventId = req.query.eventId as string;

  if (!eventId) {
    return res.status(400).json({ success: false, message: "eventId parameter is required." });
  }

  try {
    let query = supabase
      .from("students")
      .select("*, attendance(scanned_at, scanned_by), email_log(status, error_message)", { count: "exact" })
      .eq("event_id", eventId)
      .order("imported_at", { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (collegeFilter) {
      query = query.eq("college", collegeFilter);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const { data: scanners } = await supabase.from("committee_users").select("id, committee_name");
    const scannerMap = new Map(scanners?.map(s => [s.id, s.committee_name]) || []);

    let students = (data || []).map((s: any) => {
      const att = s.attendance;
      const email = s.email_log;
      const scanned_by = att?.scanned_by;
      
      let scanned_by_name = undefined;
      if (scanned_by) {
        scanned_by_name = scannerMap.get(scanned_by) || (scanned_by === "admin-id" ? "Admin Desk" : "Self-Scanner Station");
      }

      return {
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        college: s.college,
        form_response_id: s.form_response_id,
        imported_at: s.imported_at,
        email_status: email?.status || s.email_status || "failed",
        email_error: email?.error_message || s.email_error || undefined,
        scanned_at: att?.scanned_at || null,
        scanned_by_name
      };
    });

    // Apply manual filters in-memory due to join nesting limitations in simple client setups
    if (attendanceFilter) {
      students = students.filter(s => attendanceFilter === "yes" ? s.scanned_at !== null : s.scanned_at === null);
    }
    if (emailStatusFilter) {
      students = students.filter(s => s.email_status === emailStatusFilter);
    }

    // Paginate in memory ONLY if page/limit parameters were explicitly provided
    const hasPagination = req.query.page || req.query.limit;
    if (hasPagination) {
      const filteredCount = students.length;
      const startIndex = (page - 1) * limit;
      const paginatedStudents = students.slice(startIndex, startIndex + limit);

      return res.json({
        success: true,
        students: paginatedStudents,
        totalCount: filteredCount,
        totalPages: Math.ceil(filteredCount / limit),
        currentPage: page
      });
    } else {
      return res.json({
        success: true,
        students,
        totalCount: students.length,
        totalPages: 1,
        currentPage: 1
      });
    }
  } catch (err) {
    console.error("Fetch students error:", err);
    return res.status(500).json({ success: false, message: "Database query failed." });
  }
});

router.get(["/api/students/:id/email-preview", "/api/email-preview"], authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id || (req.query.studentId as string);
  try {
    const { data: log, error } = await supabase
      .from("email_log")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();

    if (error || !log) {
      return res.status(404).json({ success: false, message: "Email preview not found. Try generating a QR first." });
    }

    return res.json({
      success: true,
      email_html: log.email_html,
      qr_data_url: log.qr_data_url
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch email preview." });
  }
});

router.get("/api/students/:id/token", authenticateToken, (req, res, next) => {
  const isDeveloperMode = process.env.NODE_ENV !== "production";
  if (req.user?.role !== "admin" && !isDeveloperMode) {
    return res.status(403).json({ success: false, message: "Access denied: Administrator role required" });
  }
  next();
}, async (req, res) => {
  try {
    const { data: tokenRecord, error } = await supabase
      .from("qr_tokens")
      .select("*")
      .eq("student_id", req.params.id)
      .maybeSingle();

    if (error || !tokenRecord) {
      return res.status(404).json({ success: false, message: "QR Token not found for this student." });
    }

    return res.json({
      success: true,
      token: tokenRecord.token
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to retrieve student token." });
  }
});

router.post(["/api/students/manual-add", "/api/manual-add"], authenticateToken, requireAdmin, async (req, res) => {
  const { full_name, email, college, eventId, skipEmails } = req.body;
  if (!full_name || !email || !college || !eventId) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const trimmedEmail = email.trim();

  try {
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .eq("event_id", eventId)
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, message: "A student with this email address is already registered." });
    }

    const formResponseId = `manual_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
    const { data: student, error: insError } = await supabase
      .from("students")
      .insert({
        event_id: eventId,
        full_name,
        email: trimmedEmail,
        college,
        form_response_id: formResponseId,
        email_status: "failed",
        email_error: "queued"
      })
      .select("*")
      .single();

    if (insError || !student) {
      return res.status(500).json({ success: false, message: "Failed to insert student record." });
    }

    // Generate Token
    const nonce = crypto.randomBytes(8).toString("hex");
    const payload = `${student.id}:${eventId}:${nonce}`;
    const hmac = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
    const signedToken = `${payload}:${hmac}`;

    await supabase.from("qr_tokens").insert({
      student_id: student.id,
      event_id: eventId,
      token: signedToken
    });

    await supabase.from("attendance").insert({
      student_id: student.id,
      event_id: eventId,
      scanned_at: null,
      scanned_by: null
    });

    // Fetch Event Settings
    const { data: eventInfo } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    const eventName = eventInfo?.name || "Vibrant Event Tech Summit 2026";
    const eventDate = eventInfo?.event_date || "October 24, 2026";
    const eventVenue = eventInfo?.venue || "UMak Grand Theater";
    const eventDesc = eventInfo?.description || "";

    const qrDataUrl = await QRCode.toDataURL(signedToken, { margin: 1, scale: 6 });
    const emailHtml = generateEmailTemplate(full_name, college, eventName, eventDate, eventVenue, qrDataUrl, eventDesc);

    await supabase.from("email_log").insert({
      student_id: student.id,
      status: "failed",
      error_message: "queued",
      email_html: emailHtml,
      qr_data_url: qrDataUrl
    });

    if (!skipEmails) {
      try {
        await sendEmail(trimmedEmail, `Your Ticket for ${eventName}`, emailHtml, qrDataUrl);
        await supabase.from("students").update({ email_status: "sent", email_error: null }).eq("id", student.id);
        await supabase.from("email_log").update({ status: "sent", error_message: null }).eq("student_id", student.id);
      } catch (e: any) {
        await supabase.from("students").update({ email_status: "failed", email_error: e.message }).eq("id", student.id);
        await supabase.from("email_log").update({ status: "failed", error_message: e.message }).eq("student_id", student.id);
      }
    }

    const { data: updatedStudent } = await supabase
      .from("students")
      .select("*")
      .eq("id", student.id)
      .single();

    const studentToReturn = {
      ...(updatedStudent || student),
      scanned_at: null,
      scanned_by_name: undefined
    };

    notifyClients("student_added", {
      student: studentToReturn
    });

    return res.json({
      success: true,
      student: studentToReturn
    });
  } catch (err) {
    console.error("Manual add error:", err);
    return res.status(500).json({ success: false, message: "Internal server error registering student." });
  }
});

router.post(["/api/students/import-csv", "/api/import-csv"], authenticateToken, requireAdmin, async (req, res) => {
  const { students, eventId, skipEmails } = req.body;
  if (!Array.isArray(students) || !eventId) {
    return res.status(400).json({ success: false, message: "Invalid payload: students array and eventId required" });
  }

  // Fetch Event Settings
  const { data: eventInfo } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  const eventName = eventInfo?.name || "Vibrant Event Tech Summit 2026";
  const eventDate = eventInfo?.event_date || "October 24, 2026";
  const eventVenue = eventInfo?.venue || "UMak Grand Theater";
  const eventDesc = eventInfo?.description || "";

  let insertedCount = 0;
  const emailPromises: Promise<any>[] = [];

  for (const s of students) {
    const { full_name, email, college } = s;
    if (!full_name || !email || !college) continue;

    const trimmedEmail = email.trim();

    try {
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("event_id", eventId)
        .eq("email", trimmedEmail)
        .maybeSingle();

      if (existing) continue;

      const formResponseId = `csv_import_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
      const { data: student, error: insError } = await supabase
        .from("students")
        .insert({
          event_id: eventId,
          full_name,
          email: trimmedEmail,
          college,
          form_response_id: formResponseId,
          email_status: "failed",
          email_error: "queued"
        })
        .select("id")
        .single();

      if (insError || !student) continue;

      const nonce = crypto.randomBytes(8).toString("hex");
      const payload = `${student.id}:${eventId}:${nonce}`;
      const hmac = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
      const signedToken = `${payload}:${hmac}`;

      await supabase.from("qr_tokens").insert({
        student_id: student.id,
        event_id: eventId,
        token: signedToken
      });

      await supabase.from("attendance").insert({
        student_id: student.id,
        event_id: eventId,
        scanned_at: null,
        scanned_by: null
      });

      const qrDataUrl = await QRCode.toDataURL(signedToken, { margin: 1, scale: 6 });
      const emailHtml = generateEmailTemplate(full_name, college, eventName, eventDate, eventVenue, qrDataUrl, eventDesc);

      await supabase.from("email_log").insert({
        student_id: student.id,
        status: "failed",
        error_message: "queued",
        email_html: emailHtml,
        qr_data_url: qrDataUrl
      });

      if (!skipEmails) {
        const emailPromise = sendEmail(trimmedEmail, `Your Ticket for ${eventName}`, emailHtml, qrDataUrl)
          .then(async () => {
            await supabase.from("students").update({ email_status: "sent", email_error: null }).eq("id", student.id);
            await supabase.from("email_log").update({ status: "sent", error_message: null }).eq("student_id", student.id);
          })
          .catch(async (e) => {
            await supabase.from("students").update({ email_status: "failed", email_error: e.message }).eq("id", student.id);
            await supabase.from("email_log").update({ status: "failed", error_message: e.message }).eq("student_id", student.id);
          });
        emailPromises.push(emailPromise);
      }

      insertedCount++;
    } catch (err) {
      console.error("Failed to import student:", err);
    }
  }

  if (emailPromises.length > 0) {
    await Promise.allSettled(emailPromises);
  }

  notifyClients("bulk_sync", {});
  return res.json({ success: true, insertedCount });
});

router.post(["/api/students/:id/resend", "/api/resend"], authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id || (req.query.studentId as string) || req.body.studentId;

  try {
    const { data: student, error: stdError } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .maybeSingle();

    if (stdError || !student) {
      return res.status(404).json({ success: false, message: "Student registrant not found." });
    }

    const { data: tokenRecord, error: tkError } = await supabase
      .from("qr_tokens")
      .select("token")
      .eq("student_id", studentId)
      .maybeSingle();

    if (tkError || !tokenRecord) {
      return res.status(404).json({ success: false, message: "Signed QR token missing for this registrant." });
    }

    const { data: eventInfo } = await supabase
      .from("events")
      .select("*")
      .eq("id", student.event_id)
      .single();

    const eventName = eventInfo?.name || "Vibrant Event Tech Summit 2026";
    const eventDate = eventInfo?.event_date || "October 24, 2026";
    const eventVenue = eventInfo?.venue || "UMak Grand Theater";
    const eventDesc = eventInfo?.description || "";

    const qrDataUrl = await QRCode.toDataURL(tokenRecord.token, { margin: 1, scale: 6 });
    const emailHtml = generateEmailTemplate(student.full_name, student.college, eventName, eventDate, eventVenue, qrDataUrl, eventDesc);

    // Update Email Log
    await supabase.from("email_log")
      .upsert({
        student_id: studentId,
        status: "sent",
        error_message: null,
        email_html: emailHtml,
        qr_data_url: qrDataUrl,
        sent_at: new Date().toISOString()
      }, { onConflict: "student_id" });

    await supabase.from("students").update({ email_status: "sent", email_error: null }).eq("id", studentId);

    // Send email via Nodemailer SMTP
    await sendEmail(student.email, `Your Resent Ticket for ${eventName}`, emailHtml, qrDataUrl);

    notifyClients("student_updated", {
      student: {
        id: studentId,
        email_status: "sent",
        email_error: null
      }
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Resend error:", err);
    await supabase.from("students").update({ email_status: "failed", email_error: err.message }).eq("id", studentId);
    await supabase.from("email_log").upsert({
      student_id: studentId,
      status: "failed",
      error_message: err.message,
      sent_at: new Date().toISOString()
    }, { onConflict: "student_id" });

    notifyClients("student_updated", {
      student: {
        id: studentId,
        email_status: "failed",
        email_error: err.message
      }
    });

    return res.status(500).json({ success: false, message: `SMTP Server dispatch failed: ${err.message}` });
  }
});

router.delete("/api/students", authenticateToken, requireAdmin, async (req, res) => {
  const eventId = req.query.eventId as string;
  const all = req.query.all === "true";

  try {
    if (all) {
      if (!eventId) {
        return res.status(400).json({ success: false, message: "eventId parameter is required." });
      }

      // Fetch all student IDs for this event
      const { data: studentRecords, error: fetchErr } = await supabase
        .from("students")
        .select("id")
        .eq("event_id", eventId);

      if (fetchErr) throw fetchErr;

      const studentIds = (studentRecords || []).map(s => s.id);

      if (studentIds.length > 0) {
        await supabase.from("email_log").delete().in("student_id", studentIds);
        await supabase.from("attendance").delete().in("student_id", studentIds);
        await supabase.from("qr_tokens").delete().in("student_id", studentIds);
        const { error: delErr } = await supabase.from("students").delete().in("id", studentIds);
        if (delErr) throw delErr;
      }

      notifyClients("bulk_delete", { eventId });
      return res.json({ success: true, count: studentIds.length });
    } else {
      const studentId = req.query.studentId as string;
      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId parameter is required." });
      }

      // Delete in cascade order: email_log → attendance → qr_tokens → student
      await supabase.from("email_log").delete().eq("student_id", studentId);
      await supabase.from("attendance").delete().eq("student_id", studentId);
      await supabase.from("qr_tokens").delete().eq("student_id", studentId);
      const { error } = await supabase.from("students").delete().eq("id", studentId);
      if (error) throw error;

      notifyClients("student_deleted", { studentId });
      return res.json({ success: true });
    }
  } catch (err: any) {
    console.error("Delete student error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to delete student registrant." });
  }
});

router.post("/api/students/:id/delete", authenticateToken, requireAdmin, async (req, res) => {
  const studentId = req.params.id;

  try {
    // Delete in cascade order: email_log → attendance → qr_tokens → student
    await supabase.from("email_log").delete().eq("student_id", studentId);
    await supabase.from("attendance").delete().eq("student_id", studentId);
    await supabase.from("qr_tokens").delete().eq("student_id", studentId);
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) throw error;

    notifyClients("student_deleted", { studentId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to delete student registrant." });
  }
});

// --- SCAN ROUTER ---
router.post("/api/verify-scan", authenticateToken, requireCommitteeOrAdmin, async (req, res) => {
  const { token } = req.body;
  const scanned_by = req.user?.id;

  if (!token) {
    return res.status(400).json({ success: false, message: "Token is required for scanning verification" });
  }

  // Parse signature payload
  const parts = token.split(":");
  if (parts.length < 4) {
    return res.status(400).json({ success: false, message: "Malformed entry signature token" });
  }

  const studentId = parts[0];
  const tokenEventId = parts[1];
  const nonce = parts[2];
  const signature = parts[3];

  const { eventId: scannerEventId } = req.body;
  if (scannerEventId && tokenEventId !== scannerEventId) {
    return res.json({ status: "FAKE", message: "This ticket is not valid for this event." });
  }

  const payload = `${studentId}:${tokenEventId}:${nonce}`;
  const expectedSignature = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");

  if (signature !== expectedSignature) {
    return res.json({ status: "FAKE", message: "Fake or forged QR signature detected." });
  }

  try {
    // Run the row-locked check-and-set PL/pgSQL function in Supabase
    const { data: scanData, error: scanErr } = await supabase
      .rpc("verify_attendance_scan", {
        p_student_id: studentId,
        p_token: token,
        p_scanned_by: scanned_by
      });

    if (scanErr || !scanData || scanData.length === 0) {
      console.error("verify_attendance_scan RPC error:", scanErr);
      return res.status(500).json({ success: false, message: "Database execution failed during check-in" });
    }

    const scanResult = scanData[0];

    if (scanResult.status === "VALID") {
      notifyClients("attendance_logged", {
        student_id: studentId,
        scanned_at: scanResult.scanned_at,
        scanned_by_name: scanResult.scanned_by_name
      });

      return res.json({
        status: "VALID",
        student: {
          full_name: scanResult.student_name,
          email: scanResult.student_email,
          college: scanResult.student_college
        },
        scanned_at: scanResult.scanned_at,
        scanned_by_name: scanResult.scanned_by_name,
        time_string: new Date(scanResult.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
    } else if (scanResult.status === "ALREADY_USED") {
      return res.json({
        status: "ALREADY_USED",
        student: {
          full_name: scanResult.student_name,
          email: scanResult.student_email,
          college: scanResult.student_college
        },
        scanned_at: scanResult.scanned_at,
        original_time: scanResult.original_time,
        scanned_by_name: scanResult.scanned_by_name
      });
    } else {
      return res.json({ status: "FAKE", message: "Scan entry record mismatch or missing registrants line." });
    }
  } catch (err) {
    console.error("Scan verification system crash:", err);
    return res.status(500).json({ success: false, message: "Scanner processor offline." });
  }
});

// --- REPORT ROUTER ---
router.get("/api/export-report", authenticateToken, requireAdmin, async (req, res) => {
  const eventId = req.query.eventId as string;
  if (!eventId) {
    return res.status(400).send("eventId parameter is required.");
  }

  try {
    const { data: students, error } = await supabase
      .from("students")
      .select("*, attendance(scanned_at, scanned_by)")
      .eq("event_id", eventId);

    if (error) throw error;

    const { data: scanners } = await supabase.from("committee_users").select("id, committee_name");
    const scannerMap = new Map(scanners?.map(s => [s.id, s.committee_name]) || []);

    let csv = "Email,Name,College,Attended (Yes/No),Time Attended,Scanned By Station\n";

    for (const student of (students || [])) {
      const att = student.attendance;
      const isAttended = att && att.scanned_at ? "Yes" : "No";

      let scannedTime = "--:--";
      let scannerName = "N/A";

      if (att && att.scanned_at) {
        scannedTime = new Date(att.scanned_at).toISOString();
        scannerName = scannerMap.get(att.scanned_by) || (att.scanned_by === "admin-id" ? "Admin Desk" : "Unknown Station");
      }

      const escapedName = student.full_name.replace(/"/g, '""');
      const escapedCollege = student.college.replace(/"/g, '""');
      const escapedScanner = scannerName.replace(/"/g, '""');

      csv += `"${student.email}","${escapedName}","${escapedCollege}","${isAttended}","${scannedTime}","${escapedScanner}"\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=Event_Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).send("Failed to export report CSV.");
  }
});

// --- RESET DB ROUTER ---
router.post("/api/reset-db", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Truncate tables using filter constraints that match all uuid/text records
    await supabase.from("email_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("committee_sessions").delete().neq("id", "none");
    await supabase.from("attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("qr_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("committee_users").delete().neq("id", "none");

    await supabase.from("events").insert([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Vibrant Event Tech Summit 2026",
        event_date: "October 24, 2026 at 1:00 PM",
        description: "Please download your ticket QR and ensure you arrive 15 minutes before the event start time.",
        venue: "UMak Grand Theater",
        banner_url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60"
      }
    ]);

    await supabase.from("committee_users").insert([
      { id: "comm-1", username: "scanner1", committee_name: "Gate 1 - North Desk", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-2", username: "scanner2", committee_name: "Gate 2 - South Desk", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-3", username: "scanner3", committee_name: "VIP Registration", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-4", username: "scanner4", committee_name: "Main Entrance A", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-5", username: "scanner5", committee_name: "Main Entrance B", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-6", username: "scanner6", committee_name: "Backstage Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-7", username: "scanner7", committee_name: "Exhibitor Entrance", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-8", username: "scanner8", committee_name: "Media & Press Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-9", username: "scanner9", committee_name: "Food Hall Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-10", username: "scanner10", committee_name: "Conference Hall A", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true }
    ]);

    notifyClients("db_reset", {});
    return res.json({ success: true });
  } catch (err) {
    console.error("Database reset error:", err);
    return res.status(500).json({ success: false, message: "Database reset failed." });
  }
});

export default router;
