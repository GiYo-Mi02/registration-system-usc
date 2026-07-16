import type { VercelRequest, VercelResponse } from "@vercel/node";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { generateEmailTemplate, sendEmail } from "../server/helpers";

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

  // Get student ID from query parameter e.g., /api/resend?studentId=123
  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ success: false, message: "studentId parameter is required" });
  }

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

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Resend ticket error:", err);
    // Log failure in Supabase so user gets feedback
    try {
      await supabase.from("students").update({ email_status: "failed", email_error: err.message }).eq("id", studentId);
      await supabase.from("email_log").update({ status: "failed", error_message: err.message }).eq("student_id", studentId);
    } catch {}
    return res.status(500).json({ success: false, message: err.message || "Failed to resend ticket." });
  }
}
