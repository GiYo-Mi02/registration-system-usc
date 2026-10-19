import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../server/db.js";
import { excludeUnrequestedEmails } from "../server/email-selection.js";
import { authorizeApi } from "../server/serverless-auth.js";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  // Validate Authorization token
  if (!await authorizeApi(req, res, true)) return;

  const { eventId, emails } = req.body || {};
  if (!eventId) {
    return res.status(400).json({ success: false, message: "eventId parameter is required." });
  }

  try {
    let studentIds: string[] = [];

    if (Array.isArray(emails) && emails.length > 0) {
      const normalizedEmails = emails.map(e => e.trim().toLowerCase());
      const chunkedIds: string[] = [];
      const chunkSize = 100;
      for (let i = 0; i < normalizedEmails.length; i += chunkSize) {
        const chunkEmails = normalizedEmails.slice(i, i + chunkSize);
        const { data: students, error: fetchErr } = await supabase
          .from("students")
          .select("id")
          .eq("event_id", eventId)
          .in("email", chunkEmails);

        if (fetchErr) throw fetchErr;
        if (students) {
          chunkedIds.push(...students.map(s => s.id));
        }
      }
      studentIds = chunkedIds;
    } else {
      const { data: students, error: fetchErr } = await supabase
        .from("students")
        .select("id")
        .eq("event_id", eventId);

      if (fetchErr) throw fetchErr;
      studentIds = (students || []).map(s => s.id);
    }

    studentIds = await excludeUnrequestedEmails(supabase, studentIds);
    if (studentIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < studentIds.length; i += chunkSize) {
        const chunkIds = studentIds.slice(i, i + chunkSize);

        // Update students table
        const { error: updateErr } = await supabase
          .from("students")
          .update({ email_status: "failed", email_error: "queued" })
          .in("id", chunkIds);

        if (updateErr) throw updateErr;

        // Update email logs
        const { error: logErr } = await supabase
          .from("email_log")
          .update({
            status: "failed",
            error_message: "queued",
            delivery_status: "queued",
            provider_message_id: null,
            provider_response: null,
            accepted_recipients: [],
            rejected_recipients: []
          })
          .in("student_id", chunkIds);

        if (logErr) throw logErr;
      }
    }

    return res.status(200).json({ success: true, count: studentIds.length });
  } catch (err: any) {
    console.error("Reset emails serverless handler error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to reset student email statuses." });
  }
}
