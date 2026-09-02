import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QR_SECRET = process.env.QR_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function signaturesMatch(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !QR_SECRET) {
    return res.status(503).json({ success: false, message: "Scanner service configuration is incomplete." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Scanner session is required." });
  }

  const sessionToken = authHeader.substring(7);
  const { token, eventId } = req.body || {};
  if (typeof token !== "string" || !token || typeof eventId !== "string" || !eventId) {
    return res.status(400).json({ success: false, message: "QR token and event are required." });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from("committee_sessions")
      .select("committee_user_id, last_heartbeat")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (sessionError || !session) {
      return res.status(401).json({ success: false, message: "Scanner session expired or invalid." });
    }

    const lastHeartbeat = new Date(session.last_heartbeat).getTime();
    if (!Number.isFinite(lastHeartbeat) || lastHeartbeat < Date.now() - 5 * 60 * 1000) {
      await supabase.from("committee_sessions").delete().eq("session_token", sessionToken);
      return res.status(401).json({ success: false, message: "Scanner session expired due to inactivity." });
    }

    const scannedBy = session.committee_user_id;
    if (scannedBy !== "admin-id") {
      const { data: committeeUser, error: userError } = await supabase
        .from("committee_users")
        .select("id, active")
        .eq("id", scannedBy)
        .maybeSingle();
      if (userError || !committeeUser?.active) {
        return res.status(403).json({ success: false, message: "Scanner account is inactive." });
      }
    }

    await supabase
      .from("committee_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("session_token", sessionToken);

    const parts = token.split(":");
    if (parts.length !== 4) {
      return res.status(200).json({ status: "FAKE", message: "Malformed entry signature token." });
    }

    const [studentId, tokenEventId, nonce, signature] = parts;
    if (tokenEventId !== eventId) {
      return res.status(200).json({ status: "FAKE", message: "This ticket is not valid for this event." });
    }

    const payload = `${studentId}:${tokenEventId}:${nonce}`;
    const expectedSignature = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
    if (!signaturesMatch(signature, expectedSignature)) {
      return res.status(200).json({ status: "FAKE", message: "Fake or forged QR signature detected." });
    }

    const { data: scanData, error: scanError } = await supabase.rpc("verify_attendance_scan", {
      p_student_id: studentId,
      p_token: token,
      p_scanned_by: scannedBy
    });

    if (scanError || !scanData?.length) {
      console.error("verify_attendance_scan RPC error:", scanError);
      return res.status(500).json({ success: false, message: "Database execution failed during check-in." });
    }

    const result = scanData[0];
    if (result.status === "FAKE") {
      return res.status(200).json({ status: "FAKE", message: "Ticket is invalid or no longer matches the registration record." });
    }

    const response = {
      status: result.status,
      student: {
        full_name: result.student_name,
        email: result.student_email,
        college: result.student_college,
        program: result.student_program,
        year: result.student_year,
        section: result.student_section
      },
      scanned_at: result.scanned_at,
      original_time: result.original_time,
      scanned_by_name: result.scanned_by_name,
      time_string: result.scanned_at
        ? new Date(result.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : undefined
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Scanner verification error:", error);
    return res.status(500).json({ success: false, message: "Scanner processor offline." });
  }
}
