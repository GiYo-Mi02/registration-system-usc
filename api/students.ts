import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Validate Authorization token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authorization token required." });
  }
  const token = authHeader.substring(7);

  const { data: session, error: sessionErr } = await supabase
    .from("committee_sessions")
    .select("id")
    .eq("session_token", token)
    .maybeSingle();

  if (sessionErr || !session) {
    return res.status(401).json({ success: false, message: "Session expired or invalid." });
  }

  try {
    // ─── GET: FETCH STUDENTS LIST ───────────────────────────────────────────
    if (req.method === "GET") {
      const eventId = req.query.eventId as string;
      if (!eventId) {
        return res.status(400).json({ success: false, message: "eventId parameter is required." });
      }

      // Fetch students with attendance
      const { data: students, error: stdErr } = await supabase
        .from("students")
        .select(`
          id, full_name, email, college, form_response_id, imported_at, email_status, email_error,
          attendance(scanned_at, scanned_by)
        `)
        .eq("event_id", eventId)
        .order("imported_at", { ascending: false });

      if (stdErr) throw stdErr;

      // Fetch committee users for name mapping
      const { data: scanners } = await supabase
        .from("committee_users")
        .select("id, committee_name");

      const scannerMap = new Map<string, string>(
        (scanners || []).map((s: any) => [s.id, s.committee_name])
      );

      const formattedStudents = (students || []).map((s: any) => {
        const att = Array.isArray(s.attendance) ? s.attendance[0] : s.attendance;
        const scanned_by = att?.scanned_by ?? null;
        
        let scanned_by_name = null;
        if (scanned_by) {
          scanned_by_name = scannerMap.get(scanned_by) || (scanned_by === "admin-id" ? "Admin Desk" : "Unknown Station");
        }

        return {
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          college: s.college,
          form_response_id: s.form_response_id,
          imported_at: s.imported_at,
          email_status: s.email_status,
          email_error: s.email_error,
          scanned_at: att?.scanned_at ?? null,
          scanned_by: scanned_by,
          scanned_by_name
        };
      });

      return res.status(200).json({ success: true, students: formattedStudents });
    }

    // ─── DELETE: REMOVE STUDENT RECORD ──────────────────────────────────────
    if (req.method === "DELETE") {
      const studentId = req.query.studentId as string;
      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId parameter is required." });
      }

      // Delete in cascade order: email_log → attendance → qr_tokens → student
      await supabase.from("email_log").delete().eq("student_id", studentId);
      await supabase.from("attendance").delete().eq("student_id", studentId);
      await supabase.from("qr_tokens").delete().eq("student_id", studentId);
      const { error: delErr } = await supabase.from("students").delete().eq("id", studentId);

      if (delErr) throw delErr;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method not allowed" });
  } catch (err: any) {
    console.error("Students serverless handler error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed processing student transaction." });
  }
}
