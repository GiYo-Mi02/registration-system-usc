import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicRequest, PublicResponse } from "../server/walk-in";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import { validateWalkInDetails, isEmailFailure, isEmailNotRequested, isEventId } from "../src/lib/walk-in";

process.env.QR_SECRET = "walk-in-test-only-secret-with-32-characters";
process.env.SUPABASE_URL = "https://walk-in-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
const { publicEvents, walkInRegistration, vercelClientIp, receiptHash } = await import("../server/walk-in");
const { excludeUnrequestedEmails } = await import("../server/email-selection");
const { default: registrationRouter } = await import("../api/registration");
const { supabase } = await import("../server/db");
const eventId = "00000000-0000-4000-8000-000000000001";
const details = { full_name: " Student One ", email: " Student@Example.com ", college: "CCIS", program: "BSCS", year: "3", section: "A" };

function recorder() {
  const record = { status: 200, body: null as any, headers: {} as Record<string, string> };
  const response: PublicResponse = {
    setHeader(name, value) { record.headers[name] = value; },
    status(code) { record.status = code; return response; },
    json(body) { record.body = body; }, end() {}
  };
  return { response, record };
}

function fakeDatabase(options: { allowed?: boolean; saved?: unknown; status?: string; unavailable?: boolean; open?: boolean } = {}) {
  const calls: Array<{ name: string; args?: any }> = [];
  const query = {
    select(value: string) { calls.push({ name: "select", args: value }); return query; },
    eq(...args: unknown[]) { calls.push({ name: "eq", args }); return query; },
    order() { return query; },
    maybeSingle: async () => ({ data: options.open === false ? null : { id: eventId, name: "Test Event", event_date: "Today", venue: "Hall", description: "Test", banner_url: "" }, error: null }),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); }
  };
  const db = {
    from(table: string) { calls.push({ name: "from", args: table }); return query; },
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { error: options.unavailable ? { message: "sensitive internal error" } : null,
        data: name === "consume_walk_in_attempt" ? options.allowed !== false
          : name === "get_walk_in_ticket" ? options.saved || null
          : { status: options.status || "READY", ticket: { full_name: "Student One", event: { id: eventId }, qr_data_url: "test-qr", scanned_at: null } } };
    }
  } as unknown as SupabaseClient;
  return { db, calls };
}
function request(method = "POST", body: unknown = { ...details, eventId }): PublicRequest {
  return { method, query: { eventId }, body, headers: { "x-registration-key": "a".repeat(64) } };
}

test("walk-in validation normalizes email and rejects missing, oversized, control-character and malformed values", () => {
  assert.equal(validateWalkInDetails(details).details?.email, "student@example.com");
  for (const value of [null, { ...details, email: "bad" }, { ...details, year: "" }, { ...details, section: "a".repeat(51) }, { ...details, full_name: "bad\nname" }, { ...details, program: [] }]) assert.ok(validateWalkInDetails(value).message);
  assert.equal(isEventId(eventId), true); assert.equal(isEventId("some-event"), false);
});
test("display-only tickets are neither delivery failures nor bulk email recipients", async () => {
  assert.equal(isEmailNotRequested({ delivery_status: "not_requested" }), true);
  assert.equal(isEmailFailure({ email_status: "failed", delivery_status: "not_requested", email_error: "Email not requested" }), false);
  assert.equal(isEmailFailure({ email_status: "failed", delivery_status: "failed" }), true);
  const query = { select() { return query; }, eq() { return query; }, in: async () => ({ data: [{ student_id: "walk-in" }], error: null }) };
  const db = { from: () => query } as unknown as SupabaseClient;
  assert.deepEqual(await excludeUnrequestedEmails(db, ["imported", "walk-in"]), ["imported"]);
});
test("public event listing has an explicit public field selection and open-event filter", async () => {
  const fake = fakeDatabase(); const { response, record } = recorder();
  await publicEvents(request("GET"), response, fake.db);
  assert.equal(record.status, 200); assert.equal(record.headers["Cache-Control"], "no-store");
  assert.ok(fake.calls.some(call => call.name === "select" && call.args === "id,name,event_date,venue,description,banner_url"));
  assert.ok(fake.calls.some(call => call.name === "eq" && call.args[0] === "walk_in_open" && call.args[1] === true));
});
test("invalid event links and missing receipt secrets never reach the database", async () => {
  const fake = fakeDatabase();
  for (const req of [{ ...request(), headers: {} }, request("POST", { ...details, eventId: "invalid" })]) {
    const { response, record } = recorder(); await walkInRegistration(req, response, fake.db, "127.0.0.1"); assert.equal(record.status, 400);
  }
  assert.equal(fake.calls.length, 0);
});
test("walk-in creates the existing signed token format and submits one transaction", async () => {
  const fake = fakeDatabase(); const { response, record } = recorder();
  await walkInRegistration(request(), response, fake.db, "127.0.0.1");
  assert.equal(record.status, 200);
  const call = fake.calls.find(call => call.name === "register_walk_in")!;
  assert.equal(call.args.p_token.split(":").length, 4);
  assert.equal(call.args.p_token.split(":")[1], eventId);
  assert.match(call.args.p_qr_data_url, /^data:image\/png;base64,/);
  assert.equal(call.args.p_details.email, "student@example.com");
  assert.equal(call.args.p_request_hash, receiptHash(eventId, "a".repeat(64)));
  assert.equal(JSON.stringify(record.body).includes("p_token"), false);
});
test("uppercase event UUIDs are canonicalized before QR signing and receipt hashing", async () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const fake = fakeDatabase(); const { response, record } = recorder();
  await walkInRegistration(request("POST", { ...details, eventId: id.toUpperCase() }), response, fake.db, "127.0.0.1");
  assert.equal(record.status, 200);
  const call = fake.calls.find(call => call.name === "register_walk_in")!;
  assert.equal(call.args.p_event_id, id);
  assert.equal(call.args.p_token.split(":")[1], id);
  assert.equal(call.args.p_request_hash, receiptHash(id, "a".repeat(64)));
});
test("a retry restores the same ticket without generating another token or checking open status", async () => {
  const saved = { full_name: "Original Student", qr_data_url: "original-qr", event: { id: eventId } };
  for (const method of ["GET", "POST"]) {
    const fake = fakeDatabase({ saved, open: false }); const { response, record } = recorder();
    await walkInRegistration(request(method), response, fake.db, "127.0.0.1");
    assert.deepEqual(record.body.ticket, saved);
    assert.equal(fake.calls.some(call => call.name === "register_walk_in" || call.name === "from"), false);
  }
});
for (const [options, status, code] of [
  [{ allowed: false }, 429, undefined], [{ open: false }, 409, "CLOSED"],
  [{ status: "CLOSED" }, 409, "CLOSED"], [{ status: "DUPLICATE" }, 409, "DUPLICATE"], [{ unavailable: true }, 503, undefined]
] as const) {
  test(`registration safely handles ${JSON.stringify(options)}`, async () => {
    const fake = fakeDatabase(options); const { response, record } = recorder();
    await walkInRegistration(request(), response, fake.db, "127.0.0.1");
    assert.equal(record.status, status); assert.equal(record.body.code, code);
    assert.equal(record.body.ticket, undefined);
    assert.equal(JSON.stringify(record.body).includes("sensitive internal error"), false);
    if (status === 429) { assert.equal(record.headers["Retry-After"], "60"); assert.equal(fake.calls.length, 1); }
  });
}
test("unknown recovery key returns no participant details", async () => {
  const fake = fakeDatabase(); const { response, record } = recorder();
  await walkInRegistration(request("GET"), response, fake.db, "127.0.0.1");
  assert.equal(record.status, 404); assert.equal(record.body.ticket, undefined);
});
test("receipt hashes are event-scoped and only Vercel runtime trusts its client-IP header", () => {
  assert.notEqual(receiptHash(eventId, "a".repeat(64)), receiptHash("00000000-0000-4000-8000-000000000002", "a".repeat(64)));
  const old = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(vercelClientIp({ "x-vercel-forwarded-for": "1.2.3.4" }), "unknown");
    process.env.VERCEL = "1";
    assert.equal(vercelClientIp({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }), "1.2.3.4");
    assert.equal(vercelClientIp({ "x-vercel-forwarded-for": "untrusted,list" }), "unknown");
  } finally { if (old === undefined) delete process.env.VERCEL; else process.env.VERCEL = old; }
});
test("Vercel grouped routes keep public endpoints limited and ticket previews authenticated", async () => {
  const original = supabase.from;
  try {
    supabase.from = fakeDatabase().db.from;
    for (const [operation, expected] of [["public-events", 200], ["walk-in-registration", 400], ["email-preview", 401], ["unknown", 404]] as const) {
      const { response, record } = recorder();
      await registrationRouter({ method: "GET", headers: {}, query: { operation } } as unknown as VercelRequest, response as VercelResponse);
      assert.equal(record.status, expected, operation);
    }
  } finally { supabase.from = original; }
});
test("hosting rewrites retain the original URLs within the Hobby function limit", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  for (const operation of ["public-events", "walk-in-registration", "email-preview"]) {
    assert.ok(config.rewrites.some((route: { source: string; destination: string }) => route.source === `/api/${operation}` && route.destination === `/api/registration?operation=${operation}`));
  }
  assert.ok(fs.readdirSync(new URL("../api", import.meta.url)).filter(file => file.endsWith(".ts")).length <= 12);
});
