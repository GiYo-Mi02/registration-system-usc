import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function cleanupSessions() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // Fetch expired sessions
    const { data: expired } = await supabase
      .from("committee_sessions")
      .select("session_token")
      .lt("last_heartbeat", fiveMinutesAgo);

    if (expired && expired.length > 0) {
      const tokens = expired.map(s => s.session_token);
      await supabase.from("committee_sessions").delete().in("session_token", tokens);
    }
  } catch (err) {
    console.error("Session cleanup error:", err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authorization token required." });
  }
  const token = authHeader.substring(7);

  try {
    // Run session cleanup on demand in serverless environment
    await cleanupSessions();

    const { data: session, error: sessionErr } = await supabase
      .from("committee_sessions")
      .select("id")
      .eq("session_token", token)
      .maybeSingle();

    if (sessionErr || !session) {
      return res.status(401).json({ success: false, message: "Session expired or invalid." });
    }

    const { error } = await supabase
      .from("committee_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("session_token", token);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Heartbeat error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to update heartbeat." });
  }
}
