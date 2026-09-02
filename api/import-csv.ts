import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import {
  failedDeliveryAttemptArgs,
  generateEmailTemplate,
  isEmailQuotaExceeded,
  recordEmailDeliveryAttempt,
  sendEmail,
  successfulDeliveryAttemptArgs
} from "../server/helpers";

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

  const { students, eventId, skipEmails } = req.body;
  if (!Array.isArray(students) || !eventId) {
    return res.status(400).json({ success: false, message: "Invalid payload: students array and eventId required" });
  }
  if (!skipEmails && students.length > 5) {
    return res.status(400).json({ success: false, message: "Send-enabled imports are limited to 5 students per request." });
  }

  try {
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

    let insertedCount = 0;
    let updatedCount = 0;

    for (const s of students) {
      const fullName = String(s.full_name || "").trim();
      const trimmedEmail = String(s.email || "").trim();
      const college = String(s.college || "").trim();
      const program = String(s.program || "").trim();
      const year = String(s.year || "").trim();
      const section = String(s.section || "").trim();
      if (!fullName || !trimmedEmail || !college || !program || !year || !section) continue;

      try {
        const { data: existing } = await supabase
          .from("students")
          .select("id")
          .eq("event_id", eventId)
          .ilike("email", trimmedEmail)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from("students")
            .update({
              full_name: fullName,
              email: trimmedEmail,
              college,
              program,
              year,
              section
            })
            .eq("id", existing.id);

          if (updateError) throw updateError;

          const { data: existingEmailLog } = await supabase
            .from("email_log")
            .select("qr_data_url")
            .eq("student_id", existing.id)
            .maybeSingle();

          if (existingEmailLog?.qr_data_url) {
            const refreshedEmailHtml = generateEmailTemplate(
              fullName,
              college,
              eventName,
              eventDate,
              eventVenue,
              existingEmailLog.qr_data_url,
              eventDesc,
              program,
              year,
              section
            );
            await supabase
              .from("email_log")
              .update({ email_html: refreshedEmailHtml })
              .eq("student_id", existing.id);

            if (!skipEmails) {
              if (isEmailQuotaExceeded()) {
                const quotaMessage = "Daily user sending limit exceeded (550 5.4.5)";
                await supabase.from("students")
                  .update({ email_status: "failed", email_error: quotaMessage })
                  .eq("id", existing.id);
                await recordEmailDeliveryAttempt(
                  supabase,
                  failedDeliveryAttemptArgs(existing.id, new Error(quotaMessage), refreshedEmailHtml, existingEmailLog.qr_data_url)
                );
              } else {
                try {
                  const receipt = await sendEmail(
                    trimmedEmail,
                    `Your Updated Ticket for ${eventName}`,
                    refreshedEmailHtml,
                    existingEmailLog.qr_data_url
                  );
                  const trackingWarning = await recordEmailDeliveryAttempt(
                    supabase,
                    successfulDeliveryAttemptArgs(existing.id, receipt, refreshedEmailHtml, existingEmailLog.qr_data_url)
                  );
                  await supabase.from("students")
                    .update({
                      email_status: receipt.simulated ? "failed" : "sent",
                      email_error: receipt.simulated ? "SMTP simulation only; no email was submitted." : trackingWarning
                    })
                    .eq("id", existing.id);
                } catch (e: any) {
                  const errMsg = e?.message || String(e);
                  const isQuota = isEmailQuotaExceeded() || errMsg.includes("550") || errMsg.includes("Limit Exceeded");
                  const deliveryError = isQuota ? "Daily user sending limit exceeded (550 5.4.5)" : errMsg;
                  await supabase.from("students")
                    .update({ email_status: "failed", email_error: deliveryError })
                    .eq("id", existing.id);
                  await recordEmailDeliveryAttempt(
                    supabase,
                    failedDeliveryAttemptArgs(existing.id, e, refreshedEmailHtml, existingEmailLog.qr_data_url)
                  );
                }
              }
            }
          }

          updatedCount++;
          continue;
        }

        const formResponseId = `csv_import_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
        const { data: student, error: insError } = await supabase
          .from("students")
          .insert({
            event_id: eventId,
            full_name: fullName,
            email: trimmedEmail,
            college,
            program,
            year,
            section,
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
        const emailHtml = generateEmailTemplate(
          fullName,
          college,
          eventName,
          eventDate,
          eventVenue,
          qrDataUrl,
          eventDesc,
          program,
          year,
          section
        );

        await supabase.from("email_log").insert({
          student_id: student.id,
          status: "failed",
          error_message: "queued",
          email_html: emailHtml,
          qr_data_url: qrDataUrl
        });

        insertedCount++;

        if (!skipEmails) {
          if (isEmailQuotaExceeded()) {
            const quotaError = new Error("Daily user sending limit exceeded (550 5.4.5)");
            await supabase.from("students").update({ email_status: "failed", email_error: quotaError.message }).eq("id", student.id);
            await recordEmailDeliveryAttempt(
              supabase,
              failedDeliveryAttemptArgs(student.id, quotaError, emailHtml, qrDataUrl)
            );
          } else {
            try {
              const receipt = await sendEmail(trimmedEmail, `Your Ticket for ${eventName}`, emailHtml, qrDataUrl);
              const trackingWarning = await recordEmailDeliveryAttempt(
                supabase,
                successfulDeliveryAttemptArgs(student.id, receipt, emailHtml, qrDataUrl)
              );
              await supabase.from("students").update({
                email_status: receipt.simulated ? "failed" : "sent",
                email_error: receipt.simulated ? "SMTP simulation only; no email was submitted." : trackingWarning
              }).eq("id", student.id);
            } catch (e: any) {
              const errMsg = e?.message || String(e);
              const isQuota = isEmailQuotaExceeded() || errMsg.includes("550") || errMsg.includes("Limit Exceeded");
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

      } catch (e) {
        console.error("Failed to import individual row:", e);
      }
    }

    return res.status(200).json({ success: true, insertedCount, updatedCount });
  } catch (err: any) {
    console.error("CSV Import serverless error:", err);
    return res.status(500).json({ success: false, message: "CSV Import processor offline." });
  }
}
