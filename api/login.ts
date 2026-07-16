import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: "Username, password and role are required." });
  }

  try {
    // ─── ADMIN LOGIN ────────────────────────────────────────────────────────
    if (role === "admin") {
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: "Invalid administrator credentials." });
      }

      const sessionToken = `sess_adm_${crypto.randomBytes(16).toString("hex")}`;
      await supabase.from("committee_sessions").insert({
        id: `sess_adm_${Date.now()}`,
        committee_user_id: "admin-id",
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        token: sessionToken,
        user: { id: "admin-id", username: ADMIN_USERNAME, committee_name: "Admin Dashboard Console" },
        role: "admin"
      });
    }

    // ─── SCANNER (COMMITTEE) LOGIN ──────────────────────────────────────────
    if (role === "committee") {
      const { data: user, error } = await supabase
        .from("committee_users")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if (error || !user) {
        return res.status(401).json({ success: false, message: "Invalid scanner credentials or inactive account." });
      }

      if (!user.active) {
        return res.status(401).json({ success: false, message: "Invalid scanner credentials or inactive account." });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ success: false, message: "Invalid scanner credentials." });
      }

      const sessionToken = `sess_com_${crypto.randomBytes(16).toString("hex")}`;
      await supabase.from("committee_sessions").insert({
        id: `sess_com_${Date.now()}`,
        committee_user_id: user.id,
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        token: sessionToken,
        user: { id: user.id, username: user.username, committee_name: user.committee_name },
        role: "committee"
      });
    }

    return res.status(400).json({ success: false, message: "Unsupported role login request." });
  } catch (err: any) {
    console.error("Login serverless function crash:", err);
    return res.status(500).json({ success: false, message: "Login processor offline." });
  }
}
