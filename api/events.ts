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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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

  try {
    // ─── GET: FETCH ALL EVENTS ──────────────────────────────────────────────
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, events: data || [] });
    }

    // ─── POST: CREATE NEW EVENT ─────────────────────────────────────────────
    if (req.method === "POST") {
      const { name, event_date, venue, description, banner_url } = req.body;
      if (!name || !event_date || !venue || !description || !banner_url) {
        return res.status(400).json({ success: false, message: "Please fill in all event details." });
      }

      const { data, error } = await supabase
        .from("events")
        .insert({ name, event_date, venue, description, banner_url })
        .select("*")
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, event: data });
    }

    // ─── PUT: UPDATE EVENT ──────────────────────────────────────────────────
    if (req.method === "PUT") {
      const eventId = req.query.id as string;
      if (!eventId) {
        return res.status(400).json({ success: false, message: "Event ID parameter is required." });
      }

      const { name, event_date, venue, description, banner_url } = req.body;
      if (!name || !event_date || !venue || !description || !banner_url) {
        return res.status(400).json({ success: false, message: "Please fill in all event details." });
      }

      const { data, error } = await supabase
        .from("events")
        .update({ name, event_date, venue, description, banner_url })
        .eq("id", eventId)
        .select("*")
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, event: data });
    }

    // ─── DELETE: CASCADE DELETE EVENT ───────────────────────────────────────
    if (req.method === "DELETE") {
      const eventId = req.query.id as string;
      if (!eventId) {
        return res.status(400).json({ success: false, message: "Event ID parameter is required." });
      }

      // Delete cascade students and log records first
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("event_id", eventId);

      if (students && students.length > 0) {
        const studentIds = students.map(s => s.id);
        await supabase.from("email_log").delete().in("student_id", studentIds);
        await supabase.from("attendance").delete().in("student_id", studentIds);
        await supabase.from("qr_tokens").delete().in("student_id", studentIds);
        await supabase.from("students").delete().eq("event_id", eventId);
      }

      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method not allowed" });
  } catch (err: any) {
    console.error("Events serverless handler error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed processing event transaction." });
  }
}
