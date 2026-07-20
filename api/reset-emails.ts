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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
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

  const { eventId, emails } = req.body;
  if (!eventId) {
    return res.status(400).json({ success: false, message: "eventId parameter is required." });
  }

  try {
    let query = supabase
      .from("students")
      .select("id")
      .eq("event_id", eventId);

    if (Array.isArray(emails) && emails.length > 0) {
      const normalizedEmails = emails.map(e => e.trim().toLowerCase());
      query = query.in("email", normalizedEmails);
    }

    const { data: students, error: fetchErr } = await query;

    if (fetchErr) throw fetchErr;

    const studentIds = (students || []).map(s => s.id);

    if (studentIds.length > 0) {
      // Update students table
      const { error: updateErr } = await supabase
        .from("students")
        .update({ email_status: "failed", email_error: null })
        .in("id", studentIds);

      if (updateErr) throw updateErr;

      // Update email logs
      const { error: logErr } = await supabase
        .from("email_log")
        .update({ status: "failed", error_message: "queued" })
        .in("student_id", studentIds);

      if (logErr) throw logErr;
    }

    return res.status(200).json({ success: true, count: studentIds.length });
  } catch (err: any) {
    console.error("Reset emails serverless handler error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to reset student email statuses." });
  }
}
