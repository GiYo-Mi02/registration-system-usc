import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "../server/db.js";
import { ADMIN_USERNAME, ADMIN_PASSWORD, validateServerConfiguration } from "../server/config.js";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try { validateServerConfiguration(); } catch {
    return res.status(503).json({ success: false, message: "Login service configuration is incomplete." });
  }

  const { username, password, role } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password || username.length > 128 || password.length > 256 || !["admin", "committee"].includes(role)) {
    return res.status(400).json({ success: false, message: "Username, password and role are required." });
  }

  try {
    // ─── ADMIN LOGIN ────────────────────────────────────────────────────────
    if (role === "admin") {
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: "Invalid administrator credentials." });
      }

      const sessionToken = `sess_adm_${crypto.randomBytes(16).toString("hex")}`;
      const { error: sessionInsertError } = await supabase.from("committee_sessions").insert({
        id: `sess_adm_${crypto.randomUUID()}`,
        committee_user_id: "admin-id",
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });
      if (sessionInsertError) throw sessionInsertError;

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
      const { error: sessionInsertError } = await supabase.from("committee_sessions").insert({
        id: `sess_com_${crypto.randomUUID()}`,
        committee_user_id: user.id,
        session_token: sessionToken,
        last_heartbeat: new Date().toISOString()
      });
      if (sessionInsertError) throw sessionInsertError;

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
