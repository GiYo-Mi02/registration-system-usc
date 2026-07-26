import type { VercelRequest, VercelResponse } from "@vercel/node";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { generateEmailTemplate, sendEmail, isEmailQuotaExceeded } from "../server/helpers";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QR_SECRET = process.env.QR_SECRET || "fallback_secret";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authorization token required." });
  }
  const token = authHeader.substring(7);

  // Validate session in database
  const { data: session, error: sessionErr } = await supabase
    .from("committee_sessions")
    .select("id")
    .eq("session_token", token)
    .maybeSingle();

  if (sessionErr || !session) {
    return res.status(401).json({ success: false, message: "Session expired or invalid." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { eventId, target } = req.body;
  if (!eventId) {
    return res.status(400).json({ success: false, message: "eventId is required" });
  }

  try {
    let failedStudents = [];

    if (target === "not_attended") {
      const { data: unattendedAttendance, error: attError } = await supabase
        .from("attendance")
        .select("student_id")
        .eq("event_id", eventId)
        .is("scanned_at", null);

      if (attError) throw attError;

      if (unattendedAttendance && unattendedAttendance.length > 0) {
        const studentIds = unattendedAttendance.map(a => a.student_id);
        const chunkedStudents: any[] = [];
        const chunkSize = 100;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
          const chunkIds = studentIds.slice(i, i + chunkSize);
          const { data: studentsList, error: stdError } = await supabase
            .from("students")
            .select("*")
            .in("id", chunkIds);

          if (stdError) throw stdError;
          if (studentsList) {
            chunkedStudents.push(...studentsList);
          }
        }
        failedStudents = chunkedStudents;
      }
    } else {
      const { data: studentsList, error: stdError } = await supabase
        .from("students")
        .select("*")
        .eq("event_id", eventId)
        .eq("email_status", "failed");

      if (stdError) throw stdError;
      failedStudents = studentsList || [];
    }

    if (!failedStudents || failedStudents.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: "No matching students found to resend." });
    }

    const { data: eventInfo } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    const eventName = eventInfo?.name || "Vibrant Event Tech Summit 2026";
    const eventDate = eventInfo?.event_date || "October 24, 2026";
    const eventVenue = eventInfo?.venue || "UMak Grand Theater";
    const eventDesc = eventInfo?.description || "";

    // Set all failed students' statuses to "queued" in the DB first so UI shows they are in queue
    const studentIds = failedStudents.map(s => s.id);
    const chunkSize = 100;
    for (let i = 0; i < studentIds.length; i += chunkSize) {
      const chunkIds = studentIds.slice(i, i + chunkSize);
      await supabase.from("students")
        .update({ email_status: "failed", email_error: "queued" })
        .in("id", chunkIds);
    }

    // Process background resend sequentially to honor rate limit and circuit breaker
    (async () => {
      let sentCount = 0;

      for (const student of failedStudents) {
        if (isEmailQuotaExceeded()) {
          await supabase.from("students").update({
            email_status: "failed",
            email_error: "Daily user sending limit exceeded (550 5.4.5)"
          }).eq("id", student.id);
          continue;
        }

        try {
          let { data: tokenRecord } = await supabase
            .from("qr_tokens")
            .select("token")
            .eq("student_id", student.id)
            .maybeSingle();

          if (!tokenRecord) {
            const nonce = crypto.randomBytes(8).toString("hex");
            const payload = `${student.id}:${eventId}:${nonce}`;
            const hmac = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
            const signedToken = `${payload}:${hmac}`;

            await supabase.from("qr_tokens").insert({
              student_id: student.id,
              event_id: eventId,
              token: signedToken
            });
            tokenRecord = { token: signedToken };
          }

          const qrDataUrl = await QRCode.toDataURL(tokenRecord.token, { margin: 1, scale: 6 });
          const emailHtml = generateEmailTemplate(student.full_name, student.college, eventName, eventDate, eventVenue, qrDataUrl, eventDesc);

          await sendEmail(student.email, `Your Resent Ticket for ${eventName}`, emailHtml, qrDataUrl);

          await supabase.from("email_log")
            .upsert({
              student_id: student.id,
              status: "sent",
              error_message: null,
              email_html: emailHtml,
              qr_data_url: qrDataUrl,
              sent_at: new Date().toISOString()
            }, { onConflict: "student_id" });

          await supabase.from("students").update({ email_status: "sent", email_error: null }).eq("id", student.id);
          sentCount++;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const isQuota = isEmailQuotaExceeded() || errMsg.includes("550") || errMsg.includes("Limit Exceeded");
          console.error(`Failed to resend email for ${student.email}:`, errMsg);
          try {
            await supabase.from("students").update({
              email_status: "failed",
              email_error: isQuota ? "Daily sending limit exceeded (550 5.4.5)" : errMsg
            }).eq("id", student.id);
            await supabase.from("email_log").update({
              status: "failed",
              error_message: isQuota ? "Daily sending limit exceeded (550 5.4.5)" : errMsg
            }).eq("student_id", student.id);
          } catch {}

          if (isQuota) {
            console.error(`[BULK RESEND HALTED] Gmail sending limit reached after sending ${sentCount} emails.`);
          }
        }
      }
    })();

    return res.status(200).json({ success: true, count: failedStudents.length });
  } catch (err: any) {
    console.error("Bulk resend error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to trigger bulk resend." });
  }
}
