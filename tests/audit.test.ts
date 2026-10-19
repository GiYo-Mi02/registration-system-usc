import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateSession } from "../server/session";
import { escapeCsvValue } from "../src/lib/csv";
import { fetchEvents, fetchStudents } from "../src/lib/api";

// Every database interaction below uses a mock. No real sessions, emails or records.
process.env.SUPABASE_URL = "https://audit-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD = "test-only-password-long";
process.env.QR_SECRET = "test-only-qr-secret-with-32-characters";
process.env.ENABLE_DEMO_RESET = "false";

type FakeOptions = {
  session?: null | { committee_user_id: string; last_heartbeat: string };
  active?: boolean;
  lookupError?: boolean;
  updateError?: boolean;
  insertError?: boolean;
};
function fakeDatabase(options: FakeOptions = {}) {
  const calls: string[] = [];
  const session = options.session === undefined
    ? { committee_user_id: "scanner-1", last_heartbeat: new Date().toISOString() } : options.session;
  const from = (table: string) => {
    let action = "select";
    const result = () => {
      calls.push(`${table}:${action}`);
      if (action === "update") return { data: null, error: options.updateError ? new Error("update failed") : null };
      if (action === "insert") return { data: null, error: options.insertError ? new Error("insert failed") : null };
      if (action === "delete") return { data: null, error: null };
      if (table === "committee_sessions") return { data: session, error: options.lookupError ? new Error("offline") : null };
      if (table === "committee_users") return { data: { id: "scanner-1", username: "scanner", active: options.active ?? true }, error: null };
      return { data: [], error: null };
    };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "lt", "in", "order", "limit", "range"]) builder[method] = () => builder;
    for (const method of ["update", "insert", "delete"]) builder[method] = () => { action = method; return builder; };
    builder.maybeSingle = async () => result();
    builder.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

for (const [name, options, status] of [
  ["missing session", { session: null }, 401],
  ["expired session", { session: { committee_user_id: "scanner-1", last_heartbeat: new Date(Date.now() - 360_000).toISOString() } }, 401],
  ["invalid timestamp", { session: { committee_user_id: "scanner-1", last_heartbeat: "invalid" } }, 401],
  ["future timestamp", { session: { committee_user_id: "scanner-1", last_heartbeat: new Date(Date.now() + 360_000).toISOString() } }, 401],
  ["inactive scanner", { active: false }, 403],
  ["database lookup failure", { lookupError: true }, 503],
  ["heartbeat persistence failure", { updateError: true }, 503],
] as const) {
  test(`session rejects ${name}`, async () => {
    const fake = fakeDatabase(options);
    const result = await authenticateSession(fake.client, "test-token");
    assert.equal(result.status, status);
    assert.equal(result.user, undefined);
  });
}
test("valid scanner session returns server-derived role", async () => {
  const result = await authenticateSession(fakeDatabase().client, "test-token");
  assert.equal(result.user?.role, "committee");
});
test("valid admin session derives admin role from stored session", async () => {
  const result = await authenticateSession(fakeDatabase({ session: { committee_user_id: "admin-id", last_heartbeat: new Date().toISOString() } }).client, "test-token");
  assert.equal(result.user?.role, "admin");
});
test("empty bearer token performs no database access", async () => {
  const fake = fakeDatabase();
  assert.equal((await authenticateSession(fake.client, "")).status, 401);
  assert.deepEqual(fake.calls, []);
});

function responseRecorder() {
  const record = { status: 200, body: null as any, headers: {} as Record<string, string> };
  const response = {
    status(code: number) { record.status = code; return response; },
    json(body: unknown) { record.body = body; return response; },
    setHeader(name: string, value: string) { record.headers[name] = value; return response; },
    end() { return response; }
  };
  return { record, response: response as unknown as VercelResponse };
}
const { supabase } = await import("../server/db");
const endpointMethods = [
  ["events", "POST"], ["events", "PUT"], ["events", "PATCH"], ["events", "DELETE"],
  ["students", "GET"], ["students", "DELETE"], ["manual-add", "POST"],
  ["import-csv", "POST"], ["resend", "POST"], ["resend-bulk", "POST"],
  ["reset-emails", "POST"], ["reset-db", "POST"], ["email-preview", "GET"]
] as const;
for (const [endpoint, method] of endpointMethods) {
  test(`Vercel ${method} /api/${endpoint} rejects scanner access before data mutation`, async () => {
    const fake = fakeDatabase();
    supabase.from = fake.client.from;
    const { default: handler } = await import(`../api/${endpoint === "email-preview" ? "registration" : endpoint}.ts`);
    const { response, record } = responseRecorder();
    await handler({ method, headers: { authorization: "Bearer scanner-token" }, query: endpoint === "email-preview" ? { operation: "email-preview" } : {}, body: {} } as VercelRequest, response);
    assert.equal(record.status, 403);
    assert.equal(record.headers["Cache-Control"], "no-store");
    assert.ok(fake.calls.every(call => call.startsWith("committee_")));
  });
}
test("Vercel heartbeat rejects inactive scanner", async () => {
  supabase.from = fakeDatabase({ active: false }).client.from;
  const { default: handler } = await import("../api/heartbeat");
  const { response, record } = responseRecorder();
  await handler({ method: "POST", headers: { authorization: "Bearer scanner-token" } } as VercelRequest, response);
  assert.equal(record.status, 403);
});
test("Vercel login does not report success when session insert fails", async () => {
  supabase.from = fakeDatabase({ insertError: true }).client.from;
  const { default: handler } = await import("../api/login");
  const { response, record } = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, role: "admin" } } as VercelRequest, response);
  assert.equal(record.status, 500);
  assert.equal(record.body.token, undefined);
});
test("demo reset is denied even to admin when disabled", async () => {
  const fake = fakeDatabase({ session: { committee_user_id: "admin-id", last_heartbeat: new Date().toISOString() } });
  supabase.from = fake.client.from;
  const { default: handler } = await import("../api/reset-db");
  const { response, record } = responseRecorder();
  await handler({ method: "POST", headers: { authorization: "Bearer admin-token" } } as VercelRequest, response);
  assert.equal(record.status, 403);
  assert.ok(!fake.calls.some(call => call.endsWith(":delete")));
});
test("CSV cells neutralize formulas and preserve quoting", () => {
  for (const value of ["=HYPERLINK(\"bad\")", " +1", "-2", "@SUM(A1)", "\tvalue"]) assert.ok(escapeCsvValue(value).startsWith("'"));
  assert.equal(escapeCsvValue('Name "A"'), 'Name ""A""');
});
test("API failures are not silently converted into empty registries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  try {
    await assert.rejects(() => fetchStudents("token", "event"), /Unavailable/);
    await assert.rejects(() => fetchEvents("token"), /Unavailable/);
  } finally { globalThis.fetch = originalFetch; }
});
test("patched Nodemailer accepts generated template and inline attachments", async () => {
  const nodemailer = (await import("nodemailer")).default;
  const { generateEmailTemplate, prepareEmailForDelivery } = await import("../server/helpers");
  const qr = "data:image/png;base64,aGVsbG8=";
  const html = generateEmailTemplate("<script>bad</script>", "College", "Event", "Date", "Venue", qr, "Notice");
  assert.ok(!html.includes("<script>bad</script>"));
  const prepared = prepareEmailForDelivery(html, qr);
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const receipt = await transport.sendMail({ from: "sender@example.test", to: "recipient@example.test", html: prepared.formattedHtml, attachments: prepared.attachments });
  assert.ok(receipt.messageId);
  assert.equal(prepared.attachments.length, 1);
  assert.ok(prepared.formattedHtml.includes("cid:qrcode"));
});

test("redesigned preview preserves the saved admission QR without database writes", async () => {
  const { renderTicketPreview } = await import("../server/ticket-preview");
  const qr = "data:image/png;base64,c2F2ZWQtdGlja2V0";
  let selectedId = "";
  const query = {
    select() { return query; },
    eq(_column: string, value: string) { selectedId = value; return query; },
    async maybeSingle() {
      return { error: null, data: {
        full_name: "Attendee <One>", college: "CCIS", program: "BSCS", year: "3", section: "A",
        events: { name: "Current Event", event_date: "Current Date", venue: "Current Venue", description: "Arrival notice" }
      } };
    }
  };
  const readOnlyDatabase = { from() { return query; } } as unknown as SupabaseClient;
  const html = await renderTicketPreview(readOnlyDatabase, "student-1", { email_html: "OLD DESIGN", qr_data_url: qr });
  assert.equal(selectedId, "student-1");
  assert.ok(html.includes(`src="${qr}"`));
  assert.ok(html.includes("Current Event"));
  assert.ok(html.includes("Attendee &lt;One&gt;"));
  assert.ok(!html.includes("OLD DESIGN"));
});

test("Express enforces scanner restrictions in development and rejects malformed QR input", async () => {
  const express = (await import("express")).default;
  const { default: routes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use(routes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    for (const [path, method] of [["/api/students", "GET"], ["/api/students/123/token", "GET"], ["/api/events", "POST"], ["/api/reset-db", "POST"]]) {
      const fake = fakeDatabase();
      supabase.from = fake.client.from;
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: "Bearer scanner-token" } });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.ok(fake.calls.every(call => call.startsWith("committee_")));
    }
    supabase.from = fakeDatabase().client.from;
    const malformed = await fetch(`http://127.0.0.1:${address.port}/api/verify-scan`, { method: "POST", headers: { Authorization: "Bearer scanner-token", "Content-Type": "application/json" }, body: JSON.stringify({ token: 12, eventId: "event" }) });
    assert.equal(malformed.status, 400);
    const unauthenticated = await fetch(`http://127.0.0.1:${address.port}/api/events`);
    assert.equal(unauthenticated.status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("Vercel scanner rejects forged or wrong-event tickets without calling attendance RPC", async () => {
  const { default: handler } = await import("../api/verify-scan");
  const originalRpc = supabase.rpc;
  let rpcCalled = false;
  supabase.rpc = (() => { rpcCalled = true; throw new Error("Unexpected RPC call"); }) as typeof supabase.rpc;
  try {
    for (const token of ["malformed", "student:another-event:nonce:" + "a".repeat(64), "student:event:nonce:" + "a".repeat(64)]) {
      supabase.from = fakeDatabase().client.from;
      const { response, record } = responseRecorder();
      await handler({ method: "POST", headers: { authorization: "Bearer scanner-token" }, body: { token, eventId: "event" } } as VercelRequest, response);
      assert.equal(record.body.status, "FAKE");
    }
    assert.equal(rpcCalled, false);
  } finally { supabase.rpc = originalRpc; }
});
