import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { generateEmailTemplate, sendEmail } from "../server/helpers";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QR_SECRET = process.env.QR_SECRET || "default_dev_secret_key_change_me_in_production";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
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

  const { full_name, email, college, eventId, skipEmails } = req.body;
  if (!full_name || !email || !college || !eventId) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const trimmedEmail = email.trim();

  try {
    // Check if already registered
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

    return res.status(200).json({
      success: true,
      student: {
        ...(updatedStudent || student),
        scanned_at: null,
        scanned_by_name: undefined
      }
    });
  } catch (err: any) {
    console.error("Manual add error:", err);
    return res.status(500).json({ success: false, message: "Internal server error registering student." });
  }
}
