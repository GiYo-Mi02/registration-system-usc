import type { VercelRequest, VercelResponse } from "@vercel/node";
import QRCode from "qrcode";
import crypto from "crypto";
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

  const { eventId, studentIds } = req.body;
  if (!eventId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ success: false, message: "eventId and a non-empty studentIds array are required." });
  }

  if (studentIds.length > 5 || studentIds.some(id => typeof id !== "string")) {
    return res.status(400).json({ success: false, message: "Each delivery batch must contain between 1 and 5 valid student IDs." });
  }

  // Vercel can reuse a warm function instance. Start each explicit admin
  // retry with a fresh breaker; a genuine quota response will relatch it.
  resetEmailQuota();

  try {
    const uniqueStudentIds = Array.from(new Set(studentIds));
    const { data: studentsList, error: stdError } = await supabase
      .from("students")
      .select("*")
      .eq("event_id", eventId)
      .in("id", uniqueStudentIds);

    if (stdError) throw stdError;

    const studentsById = new Map((studentsList || []).map(student => [student.id, student]));
    const studentsToProcess = uniqueStudentIds
      .map(studentId => studentsById.get(studentId))
      .filter(Boolean);

    if (studentsToProcess.length === 0) {
      return res.status(404).json({ success: false, message: "No matching students were found for this event." });
    }

    const { data: eventInfo } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    const eventName = eventInfo?.name || "CCIS Lead Forward 2026";
    const eventDate = eventInfo?.event_date || "October 24, 2026";
    const eventVenue = eventInfo?.venue || "UMak Grand Theater";
    const eventDesc = eventInfo?.description || "";

    const results: Array<{ studentId: string; status: "smtp_accepted" | "failed" | "simulated"; messageId?: string | null; error?: string }> = [];
    let quotaExceeded = false;

    for (const student of studentsToProcess) {
      if (isEmailQuotaExceeded()) {
        quotaExceeded = true;
        break;
      }

      let emailHtml = "";
      let qrDataUrl = "";

      try {
        await supabase.from("students")
          .update({ email_status: "failed", email_error: "sending" })
          .eq("id", student.id);

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

          const { error: tokenError } = await supabase.from("qr_tokens").insert({
            student_id: student.id,
            event_id: eventId,
            token: signedToken
          });
          if (tokenError) throw tokenError;
          tokenRecord = { token: signedToken };
        }

        qrDataUrl = await QRCode.toDataURL(tokenRecord.token, { margin: 1, scale: 6 });
        emailHtml = generateEmailTemplate(
          student.full_name,
          student.college,
          eventName,
          eventDate,
          eventVenue,
          qrDataUrl,
          eventDesc,
          student.program,
          student.year,
          student.section
        );

        const receipt = await sendEmail(student.email, `Your Event Ticket for ${eventName}`, emailHtml, qrDataUrl);
        const attemptArgs = successfulDeliveryAttemptArgs(student.id, receipt, emailHtml, qrDataUrl);
        const trackingWarning = await recordEmailDeliveryAttempt(supabase, attemptArgs);

        const studentError = receipt.simulated
          ? "SMTP simulation only; no email was submitted."
          : trackingWarning;
        await supabase.from("students")
          .update({ email_status: receipt.simulated ? "failed" : "sent", email_error: studentError })
          .eq("id", student.id);

        results.push({
          studentId: student.id,
          status: receipt.simulated ? "simulated" : "smtp_accepted",
          messageId: receipt.messageId
        });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const hitQuota = isEmailQuotaExceeded() || isEmailQuotaError(err);
        const deliveryError = hitQuota ? "Daily sending limit exceeded (550 5.4.5)" : errMsg;
        console.error(`Failed to submit email for ${student.email}:`, deliveryError);

        if (emailHtml && qrDataUrl) {
          await recordEmailDeliveryAttempt(
            supabase,
            failedDeliveryAttemptArgs(student.id, err, emailHtml, qrDataUrl)
          );
        }

        await supabase.from("students")
          .update({ email_status: "failed", email_error: deliveryError })
          .eq("id", student.id);

        results.push({ studentId: student.id, status: "failed", error: deliveryError });
        if (hitQuota) {
          quotaExceeded = true;
          break;
        }
      }
    }

    const acceptedCount = results.filter(result => result.status === "smtp_accepted").length;
    const simulatedCount = results.filter(result => result.status === "simulated").length;
    const failedCount = results.filter(result => result.status === "failed").length;

    return res.status(200).json({
      success: true,
      count: results.length,
      requestedCount: studentsToProcess.length,
      acceptedCount,
      failedCount,
      simulatedCount,
      quotaExceeded,
      results,
      message: quotaExceeded
        ? "Dispatch stopped because the sending provider quota was reached."
        : "Batch completed. SMTP acceptance does not guarantee inbox delivery."
    });
  } catch (err: any) {
    console.error("Bulk resend error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to trigger bulk resend." });
  }
}
