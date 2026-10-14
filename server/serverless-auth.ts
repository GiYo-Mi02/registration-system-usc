import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./db.js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config.js";
import { authenticateSession } from "./session.js";

export async function authorizeApi(req: VercelRequest, res: VercelResponse, adminOnly = false) {
  res.setHeader("Cache-Control", "no-store");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ success: false, message: "Database service is not configured." });
    return null;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const result = await authenticateSession(supabase, token);
    if (!result.user) {
      res.status(result.status).json({ success: false, message: result.message });
      return null;
    }
    if (adminOnly && result.user.role !== "admin") {
      res.status(403).json({ success: false, message: "Administrator role required." });
      return null;
    }
    return result.user;
  } catch (error) {
    console.error("API authentication failed:", error);
    res.status(503).json({ success: false, message: "Session service is unavailable." });
    return null;
  }
}
