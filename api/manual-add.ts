import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import {
  failedDeliveryAttemptArgs,
  generateEmailTemplate,
  isEmailQuotaError,
  isEmailQuotaExceeded,
  recordEmailDeliveryAttempt,
  resetEmailQuota,
  sendEmail,
  successfulDeliveryAttemptArgs
} from "../server/helpers.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QR_SECRET = process.env.QR_SECRET || "";

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
  if (!QR_SECRET) {
    return res.status(503).json({ success: false, message: "QR signing service is not configured." });
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

  const { full_name, email, college, program, year, section, eventId, skipEmails } = req.body;
  const trimmedName = String(full_name || "").trim();
  const trimmedEmail = String(email || "").trim();
  const trimmedCollege = String(college || "").trim();
  const trimmedProgram = String(program || "").trim();
  const trimmedYear = String(year || "").trim();
  const trimmedSection = String(section || "").trim();

  if (!trimmedName || !trimmedEmail || !trimmedCollege || !trimmedProgram || !trimmedYear || !trimmedSection || !eventId) {
    return res.status(400).json({ success: false, message: "Name, email, college, program, year, section, and event are required." });
  }

  if (!skipEmails) resetEmailQuota();

  try {
    // Check if already registered
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .eq("event_id", eventId)
      .ilike("email", trimmedEmail)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, message: "A student with this email address is already registered." });
    }

    const formResponseId = `manual_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
    const { data: student, error: insError } = await supabase
      .from("students")
      .insert({
        event_id: eventId,
        full_name: trimmedName,
        email: trimmedEmail,
        college: trimmedCollege,
        program: trimmedProgram,
        year: trimmedYear,
        section: trimmedSection,
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

    const eventName = eventInfo?.name || "CCIS Lead Forward 2026";
    const eventDate = eventInfo?.event_date || "October 24, 2026";
    const eventVenue = eventInfo?.venue || "UMak Grand Theater";
    const eventDesc = eventInfo?.description || "";

    const qrDataUrl = await QRCode.toDataURL(signedToken, { margin: 1, scale: 6 });
    const emailHtml = generateEmailTemplate(
      trimmedName,
      trimmedCollege,
      eventName,
      eventDate,
      eventVenue,
      qrDataUrl,
      eventDesc,
      trimmedProgram,
      trimmedYear,
      trimmedSection
    );

    await supabase.from("email_log").insert({
      student_id: student.id,
      status: "failed",
      error_message: "queued",
      email_html: emailHtml,
      qr_data_url: qrDataUrl
    });

    if (!skipEmails) {
      if (isEmailQuotaExceeded()) {
        const quotaError = new Error("Daily user sending limit exceeded (550 5.4.5)");
        await recordEmailDeliveryAttempt(
          supabase,
          failedDeliveryAttemptArgs(student.id, quotaError, emailHtml, qrDataUrl)
        );
        await supabase.from("students").update({ email_status: "failed", email_error: quotaError.message }).eq("id", student.id);
      } else {
        try {
          const receipt = await sendEmail(trimmedEmail, `Your Ticket for ${eventName}`, emailHtml, qrDataUrl);
          const trackingWarning = await recordEmailDeliveryAttempt(
            supabase,
            successfulDeliveryAttemptArgs(student.id, receipt, emailHtml, qrDataUrl)
          );
          const studentError = receipt.simulated
            ? "SMTP simulation only; no email was submitted."
            : trackingWarning;
          await supabase.from("students").update({
            email_status: receipt.simulated ? "failed" : "sent",
            email_error: studentError
          }).eq("id", student.id);
        } catch (e: any) {
          const errMsg = e?.message || String(e);
          const isQuota = isEmailQuotaExceeded() || isEmailQuotaError(e);
          await supabase.from("students").update({
            email_status: "failed",
            email_error: isQuota ? "Daily user sending limit exceeded (550 5.4.5)" : errMsg
          }).eq("id", student.id);
          await recordEmailDeliveryAttempt(
            supabase,
            failedDeliveryAttemptArgs(student.id, e, emailHtml, qrDataUrl)
          );
        }
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
