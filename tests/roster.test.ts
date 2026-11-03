import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRoster, usableSchoolId, validateRoster } from "../src/lib/roster";
import type { PublicRequest, PublicResponse } from "../server/walk-in";

process.env.QR_SECRET = "roster-test-only-signing-key-at-least-32-characters";
process.env.SUPABASE_URL = "https://test-only.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";
const { rosterCheckIn, confirmationToken, verifyConfirmation } = await import("../server/roster-check-in");
const event = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const participantId = "00000000-0000-4000-8000-000000000003";
// Fictional fixtures keep the public repository independent of private participant data.
const rows = validateRoster(Array.from({ length: 100 }, (_, index) => ({
  full_name: index === 0 ? "Sample Cariño" : `Sample Participant ${index + 1}`,
  school: index < 2 ? "Sample School Los Baños" : `Sample School ${Math.floor(index / 2) + 1}`,
  program: "BSIT", year: "3rd Year", school_id: [2, 3, 48].includes(index) ? "" : String(1000 + index).padStart(10, "0"),
  cor: "✓", coach_name: `Sample Coach ${Math.floor(index / 2) + 1}`
})));

test("roster validation preserves participants, school coaches, leading zero IDs and Unicode", () => {
  assert.equal(rows.length, 100); assert.equal(new Set(rows.map(row => row.school)).size, 50);
  assert.equal(rows.filter(row => !usableSchoolId(row.school_id)).length, 3);
  assert.equal(rows[1].coach_name, rows[0].coach_name);
  assert.ok(rows.some(row => row.school_id === "0000001000"));
  assert.ok(rows.some(row => row.full_name.includes("Cariño")));
  assert.ok(rows.some(row => row.school.includes("Los Baños")));
  assert.ok(rows.some(row => row.cor === "✓"));
  assert.equal(usableSchoolId("0000999/No ID"), "0000999");
  assert.equal(usableSchoolId("No ID"), null);
  assert.equal(usableSchoolId(" 0000001000 "), "0000001000");
});
test("roster parser carries school and coach across rows and handles quoted newlines and named CSV", () => {
  const parsed = parseRoster('No.\tSCHOOL/UNIVERSITY\tNo. of Participants\tSTUDENT NAME\tPROGRAM\tYEAR\tSCHOOL ID\tCOR\tCOACH NAME\r\n1\t"School\nOne"\t1\t"Last, First"\tBSIT\t3rd Year\t00123\t✓\tCoach One\r\n\t\t2\tSecond Student\tBSCS\t2nd Year\tNo ID\t\t');
  assert.equal(parsed.length, 2); assert.equal(parsed[1].school, "School One"); assert.equal(parsed[1].coach_name, "Coach One");
  assert.equal(parsed[0].full_name, "Last, First"); assert.equal(parsed[0].school_id, "00123");
  assert.equal(parseRoster('full_name,school,program,year,school_id,cor,coach_name\n"Last, First",School,CS,3,00123,,Coach')[0].full_name, "Last, First");
  assert.throws(() => parseRoster('full_name,school\n"unterminated,School'));
  assert.throws(() => validateRoster([rows[0], rows[0]]), /Duplicate/);
});
test("confirmation proof rejects tampering, wrong events and expiration", () => {
  const proof = confirmationToken(event, participantId);
  assert.equal(verifyConfirmation(proof, event), participantId);
  assert.equal(verifyConfirmation(proof, other), null);
  assert.equal(verifyConfirmation(proof.replace(participantId, other), event), null);
  assert.equal(verifyConfirmation(proof.slice(0, -1), event), null);
  assert.equal(verifyConfirmation(confirmationToken(event, participantId, Date.now() - 1000), event), null);
});

test("isolated PostgreSQL: atomic import, one time-in, receipt recovery, closure and role restrictions", async t => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema extensions;");
    await db.exec((await fs.readFile(new URL("../supabase/schema_exports/registration_system_schema.sql", import.meta.url), "utf8")).replace("create extension if not exists pgcrypto with schema extensions;", ""));
    for (const file of ["20261018102618_student_walk_in_registration.sql", "20261020054714_attendance_am_pm_sessions.sql", "20261103132203_participant_roster_check_in.sql"]) await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await db.query("insert into events(id,name,event_date,description,venue,banner_url) values($1,'IT SKILLS OLYMPICS','Today','Test','Test Hall',''),($2,'Other','Today','Test','Other Hall','')", [event, other]);
    const prepared = rows.map((row, i) => ({ ...row, school_id_key: usableSchoolId(row.school_id), check_in_code: usableSchoolId(row.school_id) ? null : `ISO-TEST-${i}` }));
    const importRows = (values = prepared) => db.query<{ count: number }>("select import_participant_roster($1,$2::jsonb) as count", [event, JSON.stringify(values)]);
    const confirm = (id: string, eventId = event) => db.query<{ result: any }>("select confirm_participant_check_in($1,$2) as result", [eventId, id]);
    let id = "", original: any;
    await t.test("service role can import while closed; roster starts with no time-ins", async () => {
      await db.exec("set role service_role");
      try { assert.equal((await importRows()).rows[0].count, 100); } finally { await db.exec("reset role"); }
      assert.equal((await db.query("select * from participant_check_ins")).rows.length, 0);
      assert.equal((await db.query("select * from students")).rows.length, 0);
      id = (await db.query<{ id: string }>("select id from participant_roster order by school,full_name limit 1")).rows[0].id;
      assert.equal((await confirm(id)).rows[0].result.status, "CLOSED");
      assert.equal((await confirm(id, other)).rows[0].result.status, "NOT_FOUND");
    });
    await t.test("confirmation records database time and repeated/concurrent requests preserve one receipt", async () => {
      await db.query("update events set roster_check_in_open=true where id=$1", [event]);
      const before = Date.now();
      await db.exec("set role service_role");
      try { original = (await confirm(id)).rows[0].result; } finally { await db.exec("reset role"); }
      assert.equal(original.status, "READY");
      assert.ok(Math.abs(new Date(original.receipt.checked_in_at).getTime() - before) < 10000);
      assert.equal(original.receipt.event.id, event); assert.ok(original.receipt.participant.school_id);
      for (const result of await Promise.all([confirm(id), confirm(id), confirm(id)])) assert.deepEqual(result.rows[0].result, original);
      assert.equal((await db.query("select * from participant_check_ins")).rows.length, 1);
    });
    await t.test("closing stops new check-ins and still recovers an existing receipt", async () => {
      await db.query("update events set roster_check_in_open=false where id=$1", [event]);
      assert.deepEqual((await confirm(id)).rows[0].result, original);
      const next = (await db.query<{ id: string }>("select id from participant_roster where id<>$1 limit 1", [id])).rows[0].id;
      assert.equal((await confirm(next)).rows[0].result.status, "CLOSED");
    });
    await t.test("reimport preserves committee codes, roster IDs and receipts", async () => {
      const codes = (await db.query("select id,check_in_code from participant_roster where check_in_code is not null order by id")).rows;
      assert.equal(codes.length, 3);
      assert.equal((await importRows(prepared.map(row => ({ ...row, check_in_code: row.check_in_code ? `${row.check_in_code}-new` : null })))).rows[0].count, 0);
      assert.deepEqual((await db.query("select id,check_in_code from participant_roster where check_in_code is not null order by id")).rows, codes);
      assert.deepEqual((await confirm(id)).rows[0].result, original);
    });
    await t.test("an import failure rolls back all rows in that import", async () => {
      const invalid = [{ ...prepared[0], full_name: "New Person", school: "Test School" }, { ...prepared[1], full_name: "", school: "Test School" }];
      await assert.rejects(importRows(invalid));
      assert.equal((await db.query("select * from participant_roster where school='Test School'")).rows.length, 0);
    });
    await t.test("anon and authenticated roles cannot read, write or execute roster functions", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        try {
          for (const table of ["participant_roster", "participant_check_ins"]) {
            await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
            await assert.rejects(db.query(`delete from ${table}`), /permission denied/);
            await assert.rejects(db.query(`update ${table} set ${table === "participant_roster" ? "full_name='Wrong'" : "checked_in_at=now()"}`), /permission denied/);
            await assert.rejects(db.query(`insert into ${table} default values`), /permission denied/);
          }
          await assert.rejects(confirm(id), /permission denied/); await assert.rejects(importRows(), /permission denied/);
        } finally { await db.exec("reset role"); }
      }
    });
  } finally { await db.close(); }
});

function fakeDatabase(options: { ambiguous?: boolean; allowed?: boolean; closed?: boolean; error?: boolean; admin?: boolean; databaseSource?: boolean } = {}) {
  const calls: Array<{ name: string; args: any }> = [];
  const db = {
    from(table: string) {
      calls.push({ name: "from", args: table });
      const filters = new Map<string, unknown>();
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; }, range() { return query; },
        update() { return query; }, delete() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        ilike() { return query; },
        maybeSingle: async () => ({ error: null, data: table === "events" ? { id: event, name: "IT SKILLS OLYMPICS", roster_check_in_open: !options.closed } : table === "committee_sessions" && options.admin ? { committee_user_id: "admin-id", last_heartbeat: new Date().toISOString() } : null }),
        then(resolve: (value: unknown) => unknown) {
          let data: unknown[] = [];
          if (options.databaseSource && table === "events") data = [{ id: event }];
          if (options.databaseSource && table === "participant_roster") data = rows;
          if (table === "participant_roster" && filters.has("school_id_key")) data = options.ambiguous ? [{ id: participantId, ...rows[0] }, { id: other, ...rows[1] }] : [{ id: participantId, ...rows[0] }];
          return Promise.resolve({ data, error: options.error ? { message: "private database details" } : null }).then(resolve);
        }
      };
      return query;
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      return { error: options.error ? { message: "private database details" } : null, data: name === "consume_walk_in_attempt" ? options.allowed !== false : { status: "READY", receipt: { reference: "receipt", checked_in_at: new Date().toISOString() } } };
    }
  } as unknown as SupabaseClient;
  return { db, calls };
}
async function endpoint(action: string, method: string, body?: unknown, options: Parameters<typeof fakeDatabase>[0] = {}, eventId = event) {
  const record = { status: 200, body: null as any, headers: {} as Record<string, string> };
  const res: PublicResponse = { setHeader(name, value) { record.headers[name] = value; }, status(code) { record.status = code; return res; }, json(value) { record.body = value; }, end() {} };
  const req: PublicRequest = { method, headers: options.admin ? { authorization: "Bearer test-admin-session" } : {}, query: { action, eventId }, body };
  const fake = fakeDatabase(options);
  await rosterCheckIn(req, res, fake.db, "127.0.0.1");
  return { ...record, calls: fake.calls };
}
test("public lookup reveals one matched record and short-lived proof, without recording attendance", async () => {
  const result = await endpoint("lookup", "POST", { schoolId: rows[0].school_id });
  assert.equal(result.status, 200); assert.equal(result.body.participant.full_name, rows[0].full_name);
  assert.equal(result.body.participant.id, undefined); assert.equal(result.body.participant.check_in_code, undefined);
  assert.equal(verifyConfirmation(result.body.confirmation, event), participantId);
  assert.equal(result.calls.some(call => call.name === "confirm_participant_check_in"), false);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal((await endpoint("lookup", "POST", { schoolId: "No ID" })).status, 400);
  assert.equal((await endpoint("lookup", "POST", { schoolId: "123" }, { ambiguous: true })).status, 409);
  assert.equal((await endpoint("lookup", "POST", { schoolId: "123" }, { closed: true })).status, 409);
});
test("authenticated admin source review uses the imported database roster without a private source file", async () => {
  const result = await endpoint("source", "GET", undefined, { admin: true, databaseSource: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.eventName, "IT SKILLS OLYMPICS");
  assert.deepEqual(result.body.participants, rows);
  assert.ok(result.calls.some(call => call.name === "from" && call.args === "participant_roster"));
});
test("confirmation requires a valid event-scoped proof and rate limiting fails closed", async () => {
  const proof = confirmationToken(event, participantId);
  assert.equal((await endpoint("confirm", "POST", { confirmation: proof })).status, 200);
  assert.equal((await endpoint("confirm", "POST", { confirmation: proof }, {}, other)).status, 400);
  assert.equal((await endpoint("confirm", "POST", { confirmation: "forged" })).status, 400);
  assert.equal((await endpoint("lookup", "POST", { schoolId: "123" }, { allowed: false })).status, 429);
  const unavailable = await endpoint("lookup", "POST", { schoolId: "123" }, { error: true });
  assert.equal(unavailable.status, 503); assert.ok(!JSON.stringify(unavailable.body).includes("private database details"));
});
test("source, imports, availability and attendance ledger reject unauthenticated requests", async () => {
  for (const [action, method] of [["source", "GET"], ["admin", "GET"], ["import", "POST"], ["availability", "POST"]]) {
    const result = await endpoint(action, method, {});
    assert.equal(result.status, 401); assert.equal(result.calls.some(call => call.args === "participant_roster" || call.name === "import_participant_roster"), false);
  }
  assert.equal((await endpoint("lookup", "GET")).status, 405);
  assert.equal((await endpoint("unknown", "GET")).status, 404);
});
