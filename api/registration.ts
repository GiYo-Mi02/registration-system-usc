import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../server/db.js";
import { publicEvents, walkInRegistration, vercelClientIp } from "../server/walk-in.js";
import emailPreview from "../server/email-preview-handler.js";

/** Three stable public URLs share one function to fit the existing hosting plan. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  switch (req.query.operation) {
    case "public-events": return publicEvents(req, res, supabase);
    case "walk-in-registration": return walkInRegistration(req, res, supabase, vercelClientIp(req.headers));
    case "email-preview": return emailPreview(req, res);
    default: return res.status(404).json({ success: false, message: "Endpoint not found." });
  }
}
