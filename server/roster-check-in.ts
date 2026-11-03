import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QR_SECRET } from "./config.js";
import { authenticateSession } from "./session.js";
import type { PublicRequest, PublicResponse } from "./walk-in.js";
import { isEventId } from "../src/lib/walk-in.js";
import { usableSchoolId, validateRoster } from "../src/lib/roster.js";

const eventColumns = "id,name,event_date,venue,description,banner_url";
const participantColumns = "full_name,school,program,year,school_id,cor,coach_name";
const adminColumns = `id,${participantColumns},check_in_code`;
const fail = (res: PublicResponse, status: number, message: string) => res.status(status).json({ success: false, message });
const unavailable = (res: PublicResponse) => fail(res, 503, "Participant check-in is temporarily unavailable. Please retry or visit the committee.");

export function confirmationToken(eventId: string, participantId: string, expires = Date.now() + 10 * 60_000): string {
  const payload = `${eventId}:${participantId}:${expires}`;
  const signature = crypto.createHmac("sha256", QR_SECRET).update(`roster-confirm:${payload}`).digest("hex");
  return `${payload}:${signature}`;
}
export function verifyConfirmation(value: unknown, eventId: string, now = Date.now()): string | null {
  if (typeof value !== "string" || value.length > 250) return null;
  const [event, id, expires, signature] = value.split(":");
  if (event !== eventId || !isEventId(id) || !/^\d{13}$/.test(expires || "") || Number(expires) < now || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
  const expected = confirmationToken(event, id, Number(expires));
  return expected.length === value.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(value)) ? id : null;
}

/** Shared Express/Vercel endpoint. Roster data is restricted to authorized admins. */
export async function rosterCheckIn(req: PublicRequest, res: PublicResponse, db: SupabaseClient, ip: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const action = req.query.action;
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const publicAction = ["events", "schools", "lookup", "confirm"].includes(String(action));
  const methods: Record<string, string> = { events: "GET", schools: "GET", lookup: "POST", confirm: "POST", source: "GET", admin: "GET", import: "POST", availability: "POST" };
  if (typeof action !== "string" || !methods[action]) return fail(res, 404, "Endpoint not found.");
  if (req.method !== methods[action]) return fail(res, 405, "Method not allowed.");
  if (!QR_SECRET) return unavailable(res);
  try {
    if (!publicAction) {
      const auth = req.headers.authorization;
      const session = await authenticateSession(db, typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "");
      if (!session.user) return fail(res, session.status, session.message);
      if (session.user.role !== "admin") return fail(res, 403, "Administrator role required.");
    }
    if (action === "source") {
      const eventName = "IT SKILLS OLYMPICS";
      const { data: events, error: eventError } = await db.from("events").select("id").ilike("name", eventName).limit(2);
      if (eventError) return unavailable(res);
      if (events && events.length > 1) return fail(res, 409, "More than one IT SKILLS OLYMPICS event exists. Please use the event's roster setup.");
      if (events?.[0]) {
        const { data: participants, error } = await db.from("participant_roster").select(participantColumns).eq("event_id", events[0].id).order("school").order("full_name").range(0, 999);
        if (error) return unavailable(res);
        if (participants?.length) return res.status(200).json({ success: true, eventName, participants: validateRoster(participants) });
      }
      // Optional local bootstrap file is excluded from Git and deployments.
      // Published installations read the protected imported roster above.
      try {
        const source = JSON.parse(await fs.readFile(path.join(process.cwd(), "assets", "participant-roster.json"), "utf8"));
        return res.status(200).json({ success: true, eventName: source.eventName, participants: validateRoster(source.participants) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return fail(res, 404, "No roster has been imported yet. Upload a roster file or paste the participant list below.");
        throw error;
      }
    }
    if (action === "events") {
      const { data, error } = await db.from("events").select(eventColumns).eq("roster_check_in_open", true).order("created_at", { ascending: false });
      return error ? unavailable(res) : res.status(200).json({ success: true, events: data || [] });
    }
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId.toLowerCase() : "";
    if (!isEventId(eventId)) return fail(res, 400, "Choose a valid event.");
    if (publicAction) {
      const bucket = crypto.createHmac("sha256", QR_SECRET).update(`roster-ip:${ip}`).digest("hex");
      const configured = Number(process.env.ROSTER_CHECK_IN_RATE_LIMIT || 600);
      const limit = Number.isSafeInteger(configured) && configured > 0 && configured <= 100000 ? configured : 600;
      const { data: allowed, error } = await db.rpc("consume_walk_in_attempt", { p_bucket_hash: bucket, p_limit: limit });
      if (error) return unavailable(res);
      if (allowed !== true) { res.setHeader("Retry-After", "60"); return fail(res, 429, "Too many attempts. Please wait one minute and retry."); }
    }
    const { data: event, error: eventError } = await db.from("events").select(`${eventColumns},roster_check_in_open`).eq("id", eventId).maybeSingle();
    if (eventError) return unavailable(res);
    if (!event) return fail(res, 404, "Event not found.");
    if (action === "availability") {
      if (typeof body.open !== "boolean") return fail(res, 400, "Choose open or closed.");
      const { error } = await db.from("events").update({ roster_check_in_open: body.open }).eq("id", eventId);
      return error ? unavailable(res) : res.status(200).json({ success: true });
    }
    if (action === "import") {
      let rows;
      try {
        rows = validateRoster(body.participants).map(row => ({ ...row, school_id_key: usableSchoolId(row.school_id),
          check_in_code: usableSchoolId(row.school_id) ? null : `ISO-${crypto.randomBytes(6).toString("hex").toUpperCase()}` }));
      } catch (error) { return fail(res, 400, error instanceof Error ? error.message : "Invalid roster."); }
      const { data, error } = await db.rpc("import_participant_roster", { p_event_id: eventId, p_rows: rows });
      return error ? unavailable(res) : res.status(200).json({ success: true, inserted: data });
    }
    if (action === "admin") {
      const { data: entries, error } = await db.from("participant_roster").select(adminColumns).eq("event_id", eventId).order("school").order("full_name").range(0, 9999);
      if (error) return unavailable(res);
      const { data: checks, error: checkError } = await db.from("participant_check_ins").select(`reference,checked_in_at,participant:participant_roster!inner(${participantColumns},event_id)`).eq("participant.event_id", eventId).order("checked_in_at", { ascending: false }).range(0, 9999);
      if (checkError) return unavailable(res);
      return res.status(200).json({ success: true, entries: entries || [], receipts: (checks || []).map(check => ({ ...check, event })), open: event.roster_check_in_open });
    }
    if (action === "confirm") {
      const participantId = verifyConfirmation(body.confirmation, eventId);
      if (!participantId) return fail(res, 400, "Your confirmation has expired. Look up your school ID again.");
      const { data, error } = await db.rpc("confirm_participant_check_in", { p_event_id: eventId, p_participant_id: participantId });
      if (error) return unavailable(res);
      if (data?.status !== "READY") return fail(res, 409, "Check-in is closed or this participant is unavailable. Please visit the committee.");
      return res.status(200).json({ success: true, receipt: data.receipt });
    }
    if (!event.roster_check_in_open) return fail(res, 409, "Participant check-in is closed. Please visit the committee.");
    if (action === "schools") {
      const { data, error } = await db.from("participant_roster").select("school").eq("event_id", eventId).order("school").range(0, 9999);
      return error ? unavailable(res) : res.status(200).json({ success: true, event, schools: [...new Set((data || []).map(row => row.school))] });
    }
    const schoolId = typeof body.schoolId === "string" && body.schoolId.length <= 100 ? usableSchoolId(body.schoolId) : null;
    const school = typeof body.school === "string" && body.school.length <= 250 ? body.school.trim() : "";
    if (!schoolId) return fail(res, 400, "Enter your school ID or the unique code given by the committee.");
    // Two exact queries avoid interpolating untrusted values into PostgREST filters.
    let ids = db.from("participant_roster").select(`id,${participantColumns}`).eq("event_id", eventId).eq("school_id_key", schoolId);
    let codes = db.from("participant_roster").select(`id,${participantColumns}`).eq("event_id", eventId).eq("check_in_code", schoolId);
    if (school) { ids = ids.eq("school", school); codes = codes.eq("school", school); }
    const [byId, byCode] = await Promise.all([ids.limit(2), codes.limit(2)]);
    if (byId.error || byCode.error) return unavailable(res);
    const matches = [...new Map([...(byId.data || []), ...(byCode.data || [])].map(row => [row.id, row])).values()];
    if (!matches.length) return fail(res, 404, "No matching participant found. Check your ID and school, or ask the committee for assistance.");
    if (matches.length > 1) return fail(res, 409, "More than one participant has this ID. Select your school and try again, or visit the committee.");
    const { id, ...participant } = matches[0];
    return res.status(200).json({ success: true, participant, confirmation: confirmationToken(eventId, id) });
  } catch { return unavailable(res); }
}
