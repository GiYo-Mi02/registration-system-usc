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

  try {
    // Truncate tables using filter constraints that match all uuid/text records
    await supabase.from("email_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("committee_sessions").delete().neq("id", "none");
    await supabase.from("attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("qr_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("committee_users").delete().neq("id", "none");

    await supabase.from("events").insert([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Vibrant Event Tech Summit 2026",
        event_date: "October 24, 2026 at 1:00 PM",
        description: "Please download your ticket QR and ensure you arrive 15 minutes before the event start time.",
        venue: "UMak Grand Theater",
        banner_url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60"
      }
    ]);

    await supabase.from("committee_users").insert([
      { id: "comm-1", username: "scanner1", committee_name: "Gate 1 - North Desk", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-2", username: "scanner2", committee_name: "Gate 2 - South Desk", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-3", username: "scanner3", committee_name: "VIP Registration", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-4", username: "scanner4", committee_name: "Main Entrance A", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-5", username: "scanner5", committee_name: "Main Entrance B", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-6", username: "scanner6", committee_name: "Backstage Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-7", username: "scanner7", committee_name: "Exhibitor Entrance", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-8", username: "scanner8", committee_name: "Media & Press Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-9", username: "scanner9", committee_name: "Food Hall Gate", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true },
      { id: "comm-10", username: "scanner10", committee_name: "Conference Hall A", password_hash: "$2b$10$il37Zyf/VofLM.WqqlV.wu1lM7y/nAVISM3bgwvugBPq5jV99RmQm", active: true }
    ]);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Database reset error:", err);
    return res.status(500).json({ success: false, message: "Database reset failed." });
  }
}
