import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from "./config.js";

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

// Keep the public helper API stable for registration, import and resend handlers.
export { generateEmailTemplate } from "./ticket-template.js";

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

export function isEmailQuotaError(error: unknown): boolean {
  const smtpError = error as {
    message?: unknown;
    response?: unknown;
  };
  const combinedError = `${String(smtpError?.message || error || "")} ${String(smtpError?.response || "")}`.toLowerCase();

  return (
    combinedError.includes("5.4.5") ||
    combinedError.includes("daily user sending limit exceeded") ||
    combinedError.includes("daily user sending quota exceeded") ||
    combinedError.includes("daily smtp relay sending limit exceeded") ||
    combinedError.includes("you have reached a limit for sending mail")
  );
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
      contentDisposition: "inline" as const
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
      contentDisposition: "inline" as const
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

    // A generic SMTP 550 can be a bad recipient. Only halt on a real
    // provider quota response so one invalid address cannot stop the batch.
    if (isEmailQuotaError(err)) {
      quotaExceededFlag = true;
      quotaExceededMessage = "Gmail 550 5.4.5: Daily user sending limit exceeded. Email sending paused.";
      console.error(`[SMTP CIRCUIT BREAKER TRIGGERED] Gmail Daily Sending Limit Exceeded (550 5.4.5). Halting subsequent email dispatch attempts.`);
      throw new Error("Gmail Daily Sending Limit Exceeded (550 5.4.5). Email sending paused.");
    }

    console.error(`[SMTP ERROR] Failed to send email to ${to}:`, errMessage);
    throw err;
  }
}
