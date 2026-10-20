import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// An in-memory PostgreSQL engine: never reads .env or connects to a hosted project.
const migrationUrl = new URL("../supabase/migrations/20261018102618_student_walk_in_registration.sql", import.meta.url);
const eventId = "00000000-0000-4000-8000-000000000001";
const otherEventId = "00000000-0000-4000-8000-000000000002";
const details = { full_name: "Student One", email: "student@example.com", college: "CCIS", program: "BSCS", year: "3", section: "A" };

test("isolated PostgreSQL: migration, transaction rollback, duplicate prevention, receipts, permissions and check-in", async t => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema extensions;");
    const baseline = (await fs.readFile(new URL("../supabase/schema_exports/registration_system_schema.sql", import.meta.url), "utf8"))
      .replace("create extension if not exists pgcrypto with schema extensions;", "");
    // PostgreSQL's built-in gen_random_uuid supplies the only fixture use of pgcrypto.
    await db.exec(baseline);
    await db.exec(await fs.readFile(migrationUrl, "utf8"));
    await db.exec(await fs.readFile(new URL("../supabase/migrations/20261020054714_attendance_am_pm_sessions.sql", import.meta.url), "utf8"));
    await db.query("insert into events(id,name,event_date,description,venue,banner_url) values($1,'Walk-In Test','Today','Test','Hall',''),($2,'Other Event','Today','Test','Hall','')", [eventId, otherEventId]);
    await db.exec("insert into committee_users(id,username,committee_name,password_hash,active) values('scanner-test','scanner','Test Gate','not-a-real-password',true)");

    const create = async (hash: string, email = details.email, studentId = crypto.randomUUID(), event = eventId) => {
      const result = await db.query<{ result: any }>("select register_walk_in($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6,$7) as result",
        [event, studentId, hash, JSON.stringify({ ...details, email }), `${studentId}:${event}:nonce:signature`, "data:image/png;base64,test", "<p>saved ticket</p>"]);
      return result.rows[0].result;
    };
    const hash = "a".repeat(64);
    await t.test("all events start closed and a closed event cannot create records", async () => {
      assert.equal((await create(hash)).status, "CLOSED");
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from students")).rows[0].count, 0);
    });
    await db.query("update events set walk_in_open = true where id=$1", [eventId]);
    let original: any;
    await t.test("registration saves all four records and exposes only this ticket", async () => {
      await db.exec("set role service_role");
      try { original = await create(hash); } finally { await db.exec("reset role"); }
      assert.equal(original.status, "READY");
      assert.deepEqual(Object.keys(original.ticket).sort(), ["event", "full_name", "qr_data_url", "scanned_at"]);
      assert.equal(original.ticket.scanned_at, null);
      for (const table of ["students", "qr_tokens", "attendance", "email_log"]) assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from ${table}`)).rows[0].count, 1);
      assert.equal((await db.query<{ delivery_status: string }>("select delivery_status from email_log")).rows[0].delivery_status, "not_requested");
    });
    await t.test("lost-response retries return the same ticket, including after closing", async () => {
      await db.query("update events set walk_in_open = false where id=$1", [eventId]);
      assert.deepEqual(await create(hash), original);
      const wrongEvent = await db.query<{ result: unknown }>("select get_walk_in_ticket($1::uuid,$2) as result", [otherEventId, hash]);
      assert.equal(wrongEvent.rows[0].result, null);
      await db.query("update events set walk_in_open = true where id=$1", [eventId]);
    });
    await t.test("duplicates, including imported emails, cannot issue a replacement QR", async () => {
      assert.equal((await create("b".repeat(64), "STUDENT@EXAMPLE.COM")).status, "DUPLICATE");
      await db.query("insert into students(event_id,full_name,email,college,form_response_id,email_status) values($1,'Imported','imported@example.com','CCIS','csv-test','sent')", [eventId]);
      assert.equal((await create("c".repeat(64), "imported@example.com")).status, "DUPLICATE");
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from qr_tokens")).rows[0].count, 1);
    });
    await t.test("repeated submissions with one receipt produce one registration", async () => {
      const results = await Promise.all([create("d".repeat(64), "retry@example.com"), create("d".repeat(64), "retry@example.com")]);
      assert.deepEqual(results[0], results[1]);
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from students where email='retry@example.com'")).rows[0].count, 1);
    });
    await t.test("a failure at each write stage leaves no partial student or ticket", async () => {
      await db.exec("create function fail_test_write() returns trigger language plpgsql as $$ begin raise exception 'Injected write failure'; end $$");
      for (const table of ["students", "qr_tokens", "attendance", "email_log"]) {
        await db.exec(`create trigger fail_test before insert on ${table} for each row execute function fail_test_write()`);
        const failedId = crypto.randomUUID();
        await assert.rejects(create(crypto.randomBytes(32).toString("hex"), `${table}@example.com`, failedId), /Injected write failure/);
        for (const check of ["students", "qr_tokens", "attendance", "email_log"]) {
          const column = check === "students" ? "id" : "student_id";
          assert.equal((await db.query<{ count: number }>(`select count(*)::int as count from ${check} where ${column}=$1`, [failedId])).rows[0].count, 0);
        }
        await db.exec(`drop trigger fail_test on ${table}`);
      }
    });
    await t.test("committee check-in accepts once per session and preserves original attendance", async () => {
      const token = (await db.query<{ student_id: string; token: string }>("select student_id,token from qr_tokens where student_id=(select id from students where walk_in_request_hash=$1)", [hash])).rows[0];
      const scan = () => db.query<{ status: string; scanned_at: string }>("select * from verify_attendance_scan($1::uuid,$2,'scanner-test')", [token.student_id, token.token]);
      const first = (await scan()).rows[0]; const repeat = (await scan()).rows[0];
      assert.equal(first.status, "VALID"); assert.equal(repeat.status, "ALREADY_USED"); assert.deepEqual(first.scanned_at, repeat.scanned_at);
      assert.equal((await db.query<{ status: string }>("select * from verify_attendance_scan($1::uuid,'wrong-token','scanner-test')", [token.student_id])).rows[0].status, "FAKE");
    });
    await t.test("shared throttling caps attempts and expires old windows", async () => {
      const bucket = "e".repeat(64);
      for (const expected of [true, true, false]) assert.equal((await db.query<{ allowed: boolean }>("select consume_walk_in_attempt($1,2) as allowed", [bucket])).rows[0].allowed, expected);
      await db.query("update walk_in_rate_limits set window_start=now()-interval '5 minutes' where bucket_hash=$1", [bucket]);
      assert.equal((await db.query<{ allowed: boolean }>("select consume_walk_in_attempt($1,2) as allowed", [bucket])).rows[0].allowed, true);
    });
    await t.test("anonymous and authenticated roles cannot access receipts, counters or transactions", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        try {
          await assert.rejects(db.query("select get_walk_in_ticket($1::uuid,$2)", [eventId, hash]), /permission denied/);
          await assert.rejects(db.query("select consume_walk_in_attempt($1,120)", [hash]), /permission denied/);
          await assert.rejects(create("f".repeat(64)), /permission denied/);
          await assert.rejects(db.query("select * from walk_in_rate_limits"), /permission denied/);
          assert.equal((await db.query("select * from students")).rows.length, 0);
          assert.equal((await db.query("select * from qr_tokens")).rows.length, 0);
        } finally { await db.exec("reset role"); }
      }
    });
  } finally { await db.close(); }
});
