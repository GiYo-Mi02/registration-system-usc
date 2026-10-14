import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../server/db.js";
import { authorizeApi } from "../server/serverless-auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  // Logout is idempotent even when the session has expired.
  if (req.method === "DELETE") {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
    if (!token) return res.status(401).json({ success: false, message: "Authorization token required." });
    try {
      const { error } = await supabase.from("committee_sessions").delete().eq("session_token", token);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Logout failed:", error);
      return res.status(503).json({ success: false, message: "Session service is unavailable." });
    }
  }
  if (!await authorizeApi(req, res)) return;
  return res.status(200).json({ success: true });
}
