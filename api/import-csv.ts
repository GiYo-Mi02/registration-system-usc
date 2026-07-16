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

  const { students, eventId } = req.body;
  if (!Array.isArray(students) || !eventId) {
    return res.status(400).json({ success: false, message: "Invalid payload: students array and eventId required" });
  }

  try {
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

    let insertedCount = 0;

    for (const s of students) {
      const { full_name, email, college } = s;
      if (!full_name || !email || !college) continue;

      const trimmedEmail = email.trim();

      try {
        const { data: existing } = await supabase
          .from("students")
          .select("id")
          .eq("event_id", eventId)
          .eq("email", trimmedEmail)
          .maybeSingle();

        if (existing) continue;

        const formResponseId = `csv_import_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
        const { data: student, error: insError } = await supabase
          .from("students")
          .insert({
            event_id: eventId,
            full_name,
            email: trimmedEmail,
            college,
            form_response_id: formResponseId,
            email_status: "sent"
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
        const emailHtml = generateEmailTemplate(full_name, college, eventName, eventDate, eventVenue, qrDataUrl, eventDesc);

        await supabase.from("email_log").insert({
          student_id: student.id,
          status: "sent",
          email_html: emailHtml,
          qr_data_url: qrDataUrl
        });

        insertedCount++;

        // Send email and update status in background without blocking loop
        sendEmail(trimmedEmail, `Your Ticket for ${eventName}`, emailHtml, qrDataUrl)
          .then(async () => {
            await supabase.from("students").update({ email_status: "sent", email_error: null }).eq("id", student.id);
          })
          .catch(async (e) => {
            await supabase.from("students").update({ email_status: "failed", email_error: e.message }).eq("id", student.id);
            await supabase.from("email_log").update({ status: "failed", error_message: e.message }).eq("student_id", student.id);
          });

      } catch (e) {
        console.error("Failed to import individual row:", e);
      }
    }

    return res.status(200).json({ success: true, insertedCount });
  } catch (err: any) {
    console.error("CSV Import serverless error:", err);
    return res.status(500).json({ success: false, message: "CSV Import processor offline." });
  }
}
