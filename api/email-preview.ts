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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
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

  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ success: false, message: "studentId parameter is required." });
  }

  try {
    const { data: log, error } = await supabase
      .from("email_log")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();

    if (error || !log) {
      return res.status(404).json({ success: false, message: "Email preview not found. Try generating a QR first." });
    }

    return res.status(200).json({
      success: true,
      email_html: log.email_html,
      qr_data_url: log.qr_data_url
    });
  } catch (err: any) {
    console.error("Email preview serverless function error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch email preview." });
  }
}
