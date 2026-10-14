import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../server/db.js";
import { authorizeApi } from "../server/serverless-auth.js";
import { renderTicketPreview } from "../server/ticket-preview.js";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  // Validate Authorization token
  if (!await authorizeApi(req, res, true)) return;

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
      email_html: await renderTicketPreview(supabase, studentId, log),
      qr_data_url: log.qr_data_url
    });
  } catch (err: any) {
    console.error("Email preview serverless function error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch email preview." });
  }
}
