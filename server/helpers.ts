import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from "./config";

const EMAIL_HEADER_PUBLIC_SRC = "/ccisixplore.jpg";
const EMAIL_HEADER_CID = "ccisixplore-header";
let cachedEmailHeader: Buffer | null = null;

function getEmailHeader(): Buffer {
  if (cachedEmailHeader) return cachedEmailHeader;

  const candidatePaths = [
    path.join(process.cwd(), "public", "ccisixplore.jpg"),
    path.join(process.cwd(), "dist", "ccisixplore.jpg")
  ];
  const headerPath = candidatePaths.find(candidatePath => fs.existsSync(candidatePath));

  if (!headerPath) {
    throw new Error("Required email header image is missing: public/ccisixplore.jpg");
  }

  cachedEmailHeader = fs.readFileSync(headerPath);
  return cachedEmailHeader;
}

// Setup Nodemailer SMTP transport with pooling and rate limiting
const transporter = nodemailer.createTransport({
  pool: true,                  // Reuses SMTP connections
  maxConnections: 1,           // Limit to 1 connection to prevent concurrent login spam
  maxMessages: 50,             // Recreate connections periodically during long dispatches
  rateLimit: 1,                // Send at most 1 email...
  rateDelta: 4000,             // ...every 4 seconds (4000ms) to avoid Gmail spam filters
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for port 465, false for 587
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  }
});

// HTML escaping helper to prevent XSS injection
export function escapeHTML(str: string): string {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Event email template with an embedded artwork header and an email-safe,
// table-based admission pass body.
export function generateEmailTemplate(
  fullName: string,
  college: string,
  eventName: string,
  eventDate: string,
  eventVenue: string,
  qrDataUrl: string,
  description: string,
  program: string = "",
  year: string = "",
  section: string = ""
): string {
  const escapedName = escapeHTML(fullName);
  const escapedCollege = escapeHTML(college);
  const escapedProgram = escapeHTML(program || "Not provided");
  const escapedYear = escapeHTML(year || "Not provided");
  const escapedSection = escapeHTML(section || "Not provided");
  const escapedEvent = escapeHTML(eventName);
  const escapedDate = escapeHTML(eventDate);
  const escapedVenue = escapeHTML(eventVenue);
  const escapedDescription = escapeHTML(description).replace(/\r?\n/g, "<br />");
  const eventNotice = escapedDescription || "Keep this pass ready and follow the event team&#39;s instructions at the venue.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>Your event pass for ${escapedEvent}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .mobile-pad { padding-left: 16px !important; padding-right: 16px !important; }
      .detail-label { width: 92px !important; }
      .qr-image { width: 174px !important; height: 174px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#09052A; font-family:'Metropolis', Arial, Helvetica, sans-serif; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    Your unique admission QR for ${escapedEvent} is inside.
  </div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#09052A" style="width:100%; background-color:#09052A; background-image:linear-gradient(145deg,#09052A 0%,#32105F 48%,#0879B9 100%);">
    <tr>
      <td align="center" style="padding:28px 10px;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="email-shell" bgcolor="#FFFFFF" style="width:100%; max-width:600px; background-color:#FFFFFF; border:4px solid #FFD83D; border-radius:20px; box-shadow:0 16px 34px rgba(0,0,0,0.35);">

          <!-- Embedded event artwork header. Replaced with a CID attachment when sent. -->
          <tr>
            <td align="center" bgcolor="#170845" style="padding:0; background-color:#170845; border-radius:15px 15px 0 0; font-size:0; line-height:0;">
              <img src="${EMAIL_HEADER_PUBLIC_SRC}" width="600" alt="CCISIXPLORE General Assembly 2026, September 3, 1:00 PM to 5:00 PM, University Performing Arts Theater" style="display:block; width:100%; max-width:600px; height:auto; margin:0; border:0; border-radius:15px 15px 0 0;" />
            </td>
          </tr>

          <tr>
            <td bgcolor="#F5F0FF" class="mobile-pad" style="padding:25px 25px 29px; background-color:#F5F0FF; background-image:linear-gradient(180deg,#FFFFFF 0%,#F5F0FF 100%);">

              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:18px;">
                <tr>
                  <td align="left" style="font-size:10px; color:#6A5682; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;">Player one</td>
                  <td align="right" style="font-size:10px; color:#6A5682; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;">Ready to explore</td>
                </tr>
              </table>

              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF; border:3px solid #2A124A; border-radius:14px; box-shadow:0 6px 0 #D9CBE8;">
                <tr>
                  <td bgcolor="#E7352F" style="padding:13px 16px; background-color:#E7352F; border-bottom:3px solid #2A124A;">
                    <div style="font-size:10px; line-height:14px; color:#FFE7A8; font-weight:900; letter-spacing:1.4px; text-transform:uppercase;">Admit one</div>
                    <div style="margin-top:2px; font-size:20px; line-height:25px; color:#FFFFFF; font-weight:900; text-transform:uppercase; word-break:break-word; text-shadow:2px 2px 0 #8A1717;">${escapedName}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 15px 15px;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:13px; color:#2A124A;">
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#E7352F; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase;">College</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; text-transform:uppercase; word-break:break-word;">${escapedCollege}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#2183C8; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Program</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; text-transform:uppercase; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedProgram}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#43A62C; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Year</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; text-transform:uppercase; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedYear}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#C49A00; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Section</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; text-transform:uppercase; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedSection}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#43A62C; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Stage</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedEvent}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#C49A00; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Date &amp; time</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedDate}</td>
                  </tr>
                  <tr>
                        <td class="detail-label" width="115" valign="top" style="width:115px; padding:8px 8px 8px 0; color:#2183C8; font-size:10px; font-weight:900; letter-spacing:1px; text-transform:uppercase; border-top:1px dashed #D9CBE8;">Venue</td>
                        <td valign="top" style="padding:8px 0; color:#2A124A; font-size:13px; line-height:18px; font-weight:800; text-transform:uppercase; border-top:1px dashed #D9CBE8; word-break:break-word;">${escapedVenue}</td>
                  </tr>
                </table>
                  </td>
                </tr>
              </table>

              <!-- Question-block notice -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#FFD83D" style="margin-top:21px; background-color:#FFD83D; border:3px solid #7A4B00; border-radius:12px; box-shadow:0 5px 0 #B87908;">
                <tr>
                  <td width="56" align="center" valign="middle" style="width:56px; padding:13px 7px; color:#FFFFFF; font-size:31px; line-height:34px; font-weight:900; text-shadow:2px 2px 0 #8C5900; border-right:2px dashed #C58B13;">?</td>
                  <td valign="middle" style="padding:13px 15px; color:#53350A; font-size:12px; line-height:18px; font-weight:700;">
                    <div style="margin-bottom:3px; color:#6C4100; font-size:10px; line-height:14px; font-weight:900; letter-spacing:1.2px; text-transform:uppercase;">Power-up reminder</div>
                    ${eventNotice}
                  </td>
                </tr>
              </table>

              <!-- Green pipe QR station -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:25px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="310" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100%; max-width:310px;">
                      <tr>
                        <td align="center" bgcolor="#54C83D" style="padding:10px 14px; background-color:#54C83D; border:4px solid #165D20; border-radius:13px 13px 4px 4px; box-shadow:inset 9px 0 0 #8BE66B, inset -9px 0 0 #2A952D; color:#FFFFFF; font-size:10px; line-height:14px; font-weight:900; letter-spacing:1.3px; text-transform:uppercase; text-shadow:1px 1px 0 #165D20;">Scan at the registration gate</td>
                      </tr>
                      <tr>
                        <td align="center">
                          <table role="presentation" width="270" border="0" cellspacing="0" cellpadding="0" align="center" bgcolor="#45B834" style="width:270px; background-color:#45B834; border-left:4px solid #165D20; border-right:4px solid #165D20; box-shadow:inset 9px 0 0 #7DDE60, inset -9px 0 0 #258529;">
                            <tr>
                              <td align="center" style="padding:15px 15px 18px;">
                                <div style="display:inline-block; padding:12px; background-color:#FFFFFF; border:4px solid #2A124A; border-radius:8px; box-shadow:0 5px 0 #1B6C24;">
                                  <img class="qr-image" src="${qrDataUrl}" width="190" height="190" alt="Unique entry QR code" style="display:block; width:190px; height:190px; margin:0 auto; border:0;" />
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:17px;">
                <tr>
                  <td align="center" style="padding:0 12px; color:#5B4775; font-size:11px; line-height:17px; font-weight:700;">
                    Do not scan this code yourself. Show this email to the registration committee when you arrive. This pass is unique to you and must not be shared.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" bgcolor="#170845" style="padding:22px 20px; background-color:#170845; background-image:linear-gradient(145deg,#170845 0%,#351060 55%,#064F88 100%); border-top:5px solid #FFD83D; border-radius:0 0 15px 15px; color:#FFFFFF;">
              <div style="color:#FFD83D; font-size:13px; line-height:18px; font-weight:900; letter-spacing:1.2px; text-transform:uppercase;">&#9733;&nbsp; Mission: arrive &amp; explore &nbsp;&#9733;</div>
              <div style="margin-top:7px; color:#C8ECFF; font-size:10px; line-height:16px; font-weight:700; letter-spacing:0.5px;">Official one-time admission pass &bull; ${escapedEvent}</div>
              <div style="margin-top:13px; padding-top:12px; border-top:1px solid #5D4380; color:#9E8EB8; font-size:9px; line-height:14px; text-transform:uppercase;">&copy; 2026 University of Makati &bull; Developer Head Gio Joshua Gonzales</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

let quotaExceededFlag = false;
let quotaExceededMessage = "";

export function isEmailQuotaExceeded(): boolean {
  return quotaExceededFlag;
}

export function getEmailQuotaMessage(): string {
  return quotaExceededMessage;
}

export function resetEmailQuota(): void {
  quotaExceededFlag = false;
  quotaExceededMessage = "";
}

export function prepareEmailForDelivery(htmlContent: string, qrDataUrl?: string) {
  const attachments = [];
  let formattedHtml = htmlContent;

  if (formattedHtml.includes(`src="${EMAIL_HEADER_PUBLIC_SRC}"`)) {
    formattedHtml = formattedHtml.replace(
      `src="${EMAIL_HEADER_PUBLIC_SRC}"`,
      `src="cid:${EMAIL_HEADER_CID}"`
    );
    attachments.push({
      filename: "ccisixplore-header.jpg",
      content: getEmailHeader(),
      cid: EMAIL_HEADER_CID,
      contentType: "image/jpeg",
      contentDisposition: "inline"
    });
  }

  if (qrDataUrl) {
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const qrBuffer = Buffer.from(base64Data, "base64");

    formattedHtml = formattedHtml.replace(qrDataUrl, "cid:qrcode");
    attachments.push({
      filename: "qrcode.png",
      content: qrBuffer,
      cid: "qrcode",
      contentType: "image/png",
      contentDisposition: "inline"
    });
  }

  return { formattedHtml, attachments };
}

export interface EmailDeliveryReceipt {
  simulated: boolean;
  messageId: string | null;
  response: string | null;
  accepted: string[];
  rejected: string[];
}

function normalizeRecipientList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .map(value => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && "address" in value) {
        return String((value as { address?: unknown }).address || "");
      }
      return String(value || "");
    })
    .map(value => value.trim())
    .filter(Boolean);
}

function emailHtmlToPlainText(htmlContent: string): string {
  return htmlContent
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&bull;/gi, " - ")
    .replace(/&#9733;/g, "*")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function successfulDeliveryAttemptArgs(
  studentId: string,
  receipt: EmailDeliveryReceipt,
  emailHtml: string,
  qrDataUrl: string
) {
  const simulatedError = receipt.simulated
    ? "SMTP simulation only; no email was submitted to a recipient provider."
    : null;

  return {
    p_student_id: studentId,
    p_status: receipt.simulated ? "failed" : "sent",
    p_error_message: simulatedError,
    p_delivery_status: receipt.simulated ? "simulated" : "smtp_accepted",
    p_provider_message_id: receipt.messageId,
    p_provider_response: receipt.response,
    p_accepted_recipients: receipt.accepted,
    p_rejected_recipients: receipt.rejected,
    p_email_html: emailHtml,
    p_qr_data_url: qrDataUrl
  };
}

export function failedDeliveryAttemptArgs(
  studentId: string,
  error: unknown,
  emailHtml: string,
  qrDataUrl: string
) {
  const smtpError = error as {
    message?: unknown;
    response?: unknown;
    accepted?: unknown;
    rejected?: unknown;
  };
  const errorMessage = String(smtpError?.message || error || "Unknown email delivery failure");

  return {
    p_student_id: studentId,
    p_status: "failed",
    p_error_message: errorMessage,
    p_delivery_status: "failed",
    p_provider_message_id: null,
    p_provider_response: smtpError?.response ? String(smtpError.response) : null,
    p_accepted_recipients: normalizeRecipientList(smtpError?.accepted),
    p_rejected_recipients: normalizeRecipientList(smtpError?.rejected),
    p_email_html: emailHtml,
    p_qr_data_url: qrDataUrl
  };
}

type DeliveryAttemptArgs = ReturnType<typeof successfulDeliveryAttemptArgs>;

/**
 * Persist a transport receipt without turning an already accepted SMTP message
 * into a resendable failure if delivery-audit storage has a temporary problem.
 */
export async function recordEmailDeliveryAttempt(
  database: any,
  args: DeliveryAttemptArgs
): Promise<string | null> {
  const { error: rpcError } = await database.rpc("record_email_delivery_attempt", args);
  if (!rpcError) return null;

  console.error("Email delivery receipt RPC failed; attempting direct fallback:", rpcError);

  const { data: currentLog } = await database
    .from("email_log")
    .select("attempt_count")
    .eq("student_id", args.p_student_id)
    .maybeSingle();

  const { error: fallbackError } = await database
    .from("email_log")
    .upsert({
      student_id: args.p_student_id,
      status: args.p_status,
      error_message: args.p_error_message,
      sent_at: new Date().toISOString(),
      email_html: args.p_email_html,
      qr_data_url: args.p_qr_data_url,
      delivery_status: args.p_delivery_status,
      provider_message_id: args.p_provider_message_id,
      provider_response: args.p_provider_response,
      accepted_recipients: args.p_accepted_recipients,
      rejected_recipients: args.p_rejected_recipients,
      last_attempt_at: new Date().toISOString(),
      attempt_count: Number(currentLog?.attempt_count || 0) + 1
    }, { onConflict: "student_id" });

  if (!fallbackError) return null;

  const message = `Delivery audit could not be stored: ${fallbackError.message || String(fallbackError)}`;
  console.error(message);
  return message;
}

// Mail Dispatcher
export async function sendEmail(to: string, subject: string, htmlContent: string, qrDataUrl?: string): Promise<EmailDeliveryReceipt> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (process.env.SMTP_SIMULATE === "true") {
      console.log(`[SMTP SIMULATOR] Mock email accepted for: ${to}`);
      return {
        simulated: true,
        messageId: null,
        response: "SMTP simulation explicitly enabled",
        accepted: [to],
        rejected: []
      };
    }

    throw new Error("SMTP configuration is incomplete. No email was submitted.");
  }

  if (quotaExceededFlag) {
    const msg = quotaExceededMessage || "Gmail Daily Sending Limit Exceeded (550 5.4.5). Email dispatches are currently paused.";
    console.warn(`[SMTP CIRCUIT BREAKER] Email sending skipped for ${to} — ${msg}`);
    throw new Error(msg);
  }

  try {
    const { formattedHtml, attachments } = prepareEmailForDelivery(htmlContent, qrDataUrl);

    const info = await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject,
      text: emailHtmlToPlainText(formattedHtml),
      html: formattedHtml,
      replyTo: SMTP_USER,
      attachments
    });

    const accepted = normalizeRecipientList(info.accepted);
    const rejected = normalizeRecipientList(info.rejected);
    const recipientAccepted = accepted.some(address => address.toLowerCase() === to.trim().toLowerCase());

    if (!recipientAccepted) {
      const rejectionDetail = rejected.length > 0 ? ` Rejected: ${rejected.join(", ")}.` : "";
      const rejectionError = new Error(`SMTP server did not accept recipient ${to}.${rejectionDetail}`) as Error & {
        response?: string;
        accepted?: string[];
        rejected?: string[];
      };
      rejectionError.response = typeof info.response === "string" ? info.response : undefined;
      rejectionError.accepted = accepted;
      rejectionError.rejected = rejected;
      throw rejectionError;
    }

    console.log(`[SMTP] Recipient accepted by provider: ${to} (MessageId: ${info.messageId})`);
    return {
      simulated: false,
      messageId: info.messageId || null,
      response: typeof info.response === "string" ? info.response : null,
      accepted,
      rejected
    };
  } catch (err: any) {
    const errMessage = err?.message || String(err);
    const responseText = String(err?.response || "");
    const combinedError = `${errMessage} ${responseText}`;

    // Detect Gmail 550 5.4.5 Daily user sending limit exceeded or similar quota errors
    if (
      err?.responseCode === 550 ||
      combinedError.includes("550") ||
      combinedError.includes("5.4.5") ||
      combinedError.toLowerCase().includes("daily user sending limit exceeded") ||
      combinedError.toLowerCase().includes("sending limits")
    ) {
      quotaExceededFlag = true;
      quotaExceededMessage = "Gmail 550 5.4.5: Daily user sending limit exceeded. Email sending paused.";
      console.error(`[SMTP CIRCUIT BREAKER TRIGGERED] Gmail Daily Sending Limit Exceeded (550 5.4.5). Halting subsequent email dispatch attempts.`);
      throw new Error("Gmail Daily Sending Limit Exceeded (550 5.4.5). Email sending paused.");
    }

    console.error(`[SMTP ERROR] Failed to send email to ${to}:`, errMessage);
    throw err;
  }
}
