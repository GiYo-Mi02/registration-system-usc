import crypto from "node:crypto";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { QR_SECRET } from "./config.js";
import { generateEmailTemplate } from "./ticket-template.js";
import { isEventId, validateWalkInDetails } from "../src/lib/walk-in.js";

export type PublicRequest = {
  method?: string; query: Record<string, unknown>; headers: IncomingHttpHeaders; body?: unknown;
};
export type PublicResponse = {
  setHeader(name: string, value: string): unknown;
  status(code: number): PublicResponse;
  json(body: unknown): unknown;
  end(): unknown;
};

const publicColumns = "id,name,event_date,venue,description,banner_url";
const registrationKeyPattern = /^[a-f0-9]{64}$/;
export function receiptHash(eventId: string, key: string): string {
  return crypto.createHmac("sha256", QR_SECRET).update(`walk-in-receipt:${eventId}:${key}`).digest("hex");
}

/** Vercel overwrites this platform header. Express callers use req.ip, with configured proxy trust. */
export function vercelClientIp(headers: IncomingHttpHeaders): string {
  const value = headers["x-vercel-forwarded-for"];
  return process.env.VERCEL && typeof value === "string" && isIP(value.trim()) ? value.trim() : "unknown";
}

function prepare(res: PublicResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
function unavailable(res: PublicResponse) {
  return res.status(503).json({ success: false, message: "Registration is temporarily unavailable. Please retry or visit the assistance desk." });
}

export async function publicEvents(req: PublicRequest, res: PublicResponse, db: SupabaseClient) {
  prepare(res);
  if (req.method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed." });
  const eventId = req.query.eventId;
  if (eventId !== undefined && !isEventId(eventId)) return res.status(400).json({ success: false, message: "Invalid event link." });
  try {
    let query = db.from("events").select(publicColumns).eq("walk_in_open", true).order("created_at", { ascending: false });
    if (eventId) query = query.eq("id", eventId);
    const { data, error } = await query;
    if (error) return unavailable(res);
    return res.status(200).json({ success: true, events: data || [] });
  } catch { return unavailable(res); }
}

export async function walkInRegistration(req: PublicRequest, res: PublicResponse, db: SupabaseClient, clientIp: string) {
  prepare(res);
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed." });
  if (!QR_SECRET) return unavailable(res);
  const key = req.headers["x-registration-key"];
  if (typeof key !== "string" || !registrationKeyPattern.test(key)) {
    return res.status(400).json({ success: false, message: "Registration session is missing. Please reload the registration page." });
  }
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const suppliedEventId = req.method === "GET" ? req.query.eventId : body.eventId;
  if (!isEventId(suppliedEventId)) return res.status(400).json({ success: false, message: "Invalid event link." });
  const eventId = suppliedEventId.toLowerCase();
  try {
    const configuredLimit = Number(process.env.WALK_IN_RATE_LIMIT || 120);
    const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 100000 ? configuredLimit : 120;
    const bucket = crypto.createHmac("sha256", QR_SECRET).update(`walk-in-ip:${clientIp}`).digest("hex");
    const { data: allowed, error: limitError } = await db.rpc("consume_walk_in_attempt", { p_bucket_hash: bucket, p_limit: limit });
    if (limitError) return unavailable(res);
    if (allowed !== true) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ success: false, message: "Too many registration requests. Please wait one minute and retry." });
    }
    const hash = receiptHash(eventId, key);
    // A receipt can restore an issued ticket even if the event is now closed.
    const { data: saved, error: receiptError } = await db.rpc("get_walk_in_ticket", { p_event_id: eventId, p_request_hash: hash });
    if (receiptError) return unavailable(res);
    if (saved) return res.status(200).json({ success: true, ticket: saved });
    if (req.method === "GET") return res.status(404).json({ success: false, message: "No ticket has been issued in this registration session." });
    const { details, message } = validateWalkInDetails(body);
    if (!details) return res.status(400).json({ success: false, message });
    const { data: event, error: eventError } = await db.from("events").select(publicColumns).eq("id", eventId).eq("walk_in_open", true).maybeSingle();
    if (eventError) return unavailable(res);
    if (!event) return res.status(409).json({ success: false, code: "CLOSED", message: "Walk-in registration is closed for this event. Please visit the assistance desk." });
    const studentId = crypto.randomUUID();
    const payload = `${studentId}:${eventId}:${crypto.randomBytes(8).toString("hex")}`;
    const token = `${payload}:${crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex")}`;
    const qrDataUrl = await QRCode.toDataURL(token, { margin: 4, scale: 8 });
    const html = generateEmailTemplate(details.full_name, details.college, event.name, event.event_date, event.venue,
      qrDataUrl, event.description, details.program, details.year, details.section);
    const { data, error } = await db.rpc("register_walk_in", {
      p_event_id: eventId, p_student_id: studentId, p_request_hash: hash, p_details: details,
      p_token: token, p_qr_data_url: qrDataUrl, p_email_html: html
    });
    if (error || !data) return unavailable(res);
    if (data.status === "DUPLICATE") return res.status(409).json({ success: false, code: "DUPLICATE", message: "This email is already registered for this event. Use your existing ticket or visit the assistance desk." });
    if (data.status === "CLOSED") return res.status(409).json({ success: false, code: "CLOSED", message: "Walk-in registration has closed. Please visit the assistance desk." });
    if (data.status !== "READY" || !data.ticket) return unavailable(res);
    return res.status(200).json({ success: true, ticket: data.ticket });
  } catch { return unavailable(res); }
}

export async function setWalkInAvailability(db: SupabaseClient, eventId: unknown, open: unknown) {
  if (!isEventId(eventId) || typeof open !== "boolean") return { status: 400, body: { success: false, message: "A valid event ID and walk_in_open boolean are required." } };
  const { data, error } = await db.from("events").update({ walk_in_open: open }).eq("id", eventId).select("*").maybeSingle();
  if (error) return { status: 503, body: { success: false, message: "Walk-in availability could not be saved." } };
  if (!data) return { status: 404, body: { success: false, message: "Event not found." } };
  return { status: 200, body: { success: true, event: data } };
}
