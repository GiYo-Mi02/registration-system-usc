import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { attendanceFields, sessionCsvCells, matchesAttendance, formatAttendanceTime } from "../src/lib/attendance";

const migrationUrl = new URL("../supabase/migrations/20261020054714_attendance_am_pm_sessions.sql", import.meta.url);
const eventId = "00000000-0000-4000-8000-000000000001";
const am = "2026-10-20T03:59:59.999Z";
const pm = "2026-10-20T04:00:00.000Z";

test("AM/PM migration preserves historical tickets and records one attendance per session", async t => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema extensions;");
    const baseline = (await fs.readFile(new URL("../supabase/schema_exports/registration_system_schema.sql", import.meta.url), "utf8")).replace("create extension if not exists pgcrypto with schema extensions;", "");
    await db.exec(baseline);
    await db.exec(await fs.readFile(new URL("../supabase/migrations/20261018102618_student_walk_in_registration.sql", import.meta.url), "utf8"));
    await db.query("insert into events(id,name,event_date,description,venue,banner_url,walk_in_open) values($1,'Test','Today','Test','Hall','',true)", [eventId]);
    await db.exec("insert into committee_users(id,username,committee_name,password_hash,active) values('scanner','scanner','Gate One','test',true),('inactive','inactive','Inactive','test',false)");
    const fixture = async (time: string | null = null) => {
      const id = crypto.randomUUID(), token = `${id}:${eventId}:nonce:unchanged-signed-token`;
      await db.query("insert into students(id,event_id,full_name,email,college,form_response_id,email_status) values($1::uuid,$2,'Student',$3,'CCIS',$1::text,'sent')", [id,eventId,`${id}@example.com`]);
      await db.query("insert into qr_tokens(student_id,event_id,token) values($1,$2,$3)", [id,eventId,token]);
      await db.query("insert into attendance(student_id,event_id,scanned_at,scanned_by) values($1,$2,$3,case when $3::timestamptz is null then null else 'scanner' end)", [id,eventId,time]);
      return { id, token };
    };
    const oldAm = await fixture(am), oldPm = await fixture(pm), fresh = await fixture();
    const before = (await db.query("select * from qr_tokens order by id")).rows;
    const migration = await fs.readFile(migrationUrl, "utf8");
    assert.equal((migration.match(/clock_timestamp\(\)/g) || []).length, 1);
    // Test-only clock injection; the production SQL never accepts a client clock/session.
    await db.exec(migration.replace("clock_timestamp()", "coalesce(nullif(current_setting('test.scan_at',true), '')::timestamptz, clock_timestamp())"));
    const state = async (id: string) => (await db.query<any>("select * from attendance where student_id=$1", [id])).rows[0];
    const scan = async (f: {id:string;token:string}, time: string, token = f.token, scanner = "scanner") => {
      await db.query("select set_config('test.scan_at',$1,false)", [time]);
      return (await db.query<any>("select * from verify_attendance_scan($1::uuid,$2,$3)", [f.id,token,scanner])).rows[0];
    };
    await t.test("backfill assigns historical AM and noon PM accurately without inventing attendance", async () => {
      const a=await state(oldAm.id), p=await state(oldPm.id), f=await state(fresh.id);
      assert.equal(a.am_scanned_at.toISOString(),am); assert.equal(a.pm_scanned_at,null); assert.equal(a.am_scanned_by,"scanner");
      assert.equal(p.pm_scanned_at.toISOString(),pm); assert.equal(p.am_scanned_at,null); assert.equal(p.scanned_at.toISOString(),pm);
      assert.equal(f.am_scanned_at,null); assert.equal(f.pm_scanned_at,null);
    });
    await t.test("same QR is accepted once before noon and once at exactly noon", async () => {
      const first=await scan(fresh,am); assert.equal(first.status,"VALID"); assert.equal(first.attendance_session,"AM");
      const repeat=await scan(fresh,am); assert.equal(repeat.status,"ALREADY_USED"); assert.deepEqual(repeat.scanned_at,first.scanned_at);
      const afternoon=await scan(fresh,pm); assert.equal(afternoon.status,"VALID"); assert.equal(afternoon.attendance_session,"PM");
      const second=await scan(fresh,"2026-10-20T07:00:00Z"); assert.equal(second.status,"ALREADY_USED"); assert.deepEqual(second.scanned_at,afternoon.scanned_at);
      const s=await state(fresh.id); assert.equal(s.am_scanned_at.toISOString(),am); assert.equal(s.pm_scanned_at.toISOString(),pm); assert.equal(s.scanned_at.toISOString(),am);
    });
    await t.test("existing AM attendee can check in for PM and historical PM remains duplicate", async () => {
      assert.equal((await scan(oldAm,pm)).status,"VALID"); assert.equal((await scan(oldPm,pm)).status,"ALREADY_USED");
      assert.equal((await state(oldAm.id)).scanned_at.toISOString(),am);
    });
    await t.test("PM-only student does not acquire AM attendance", async () => {
      const f=await fixture(); assert.equal((await scan(f,pm)).status,"VALID"); assert.equal((await state(f.id)).am_scanned_at,null);
    });
    await t.test("invalid tokens, missing records, and inactive scanners cannot alter attendance", async () => {
      const f=await fixture();
      for(const [token,scanner] of [["wrong","scanner"],[f.token,"inactive"]]) assert.equal((await scan(f,pm,token,scanner)).status,"FAKE");
      assert.equal((await scan({id:crypto.randomUUID(),token:"missing"},pm)).status,"FAKE");
      assert.equal((await state(f.id)).scanned_at,null);
    });
    await t.test("tokens, original station and original first timestamp are unchanged", async () => {
      const after = (await db.query<any>("select * from qr_tokens where student_id=any($1::uuid[]) order by id", [[oldAm.id,oldPm.id,fresh.id]])).rows;
      assert.deepEqual(after,before); assert.equal((await state(oldAm.id)).scanned_by,"scanner");
    });
    await t.test("walk-in transaction still creates an unscanned reusable ticket", async () => {
      const id=crypto.randomUUID();
      const result=(await db.query<any>("select register_walk_in($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6,$7) as result", [eventId,id,"a".repeat(64),JSON.stringify({full_name:"Walk In",email:"walkin@example.com",college:"CCIS",program:"BSCS",year:"3",section:"A"}),"stored-walkin-token","data:image/png;base64,test","<p>ticket</p>"])).rows[0].result;
      assert.equal(result.status,"READY"); assert.equal((await state(id)).pm_scanned_at,null);
      assert.equal((await scan({id,token:"stored-walkin-token"},am)).status,"VALID"); assert.equal((await scan({id,token:"stored-walkin-token"},pm)).status,"VALID");
    });
    await t.test("public roles denied; service role can scan", async () => {
      for(const role of ["anon","authenticated"]) {
        await db.exec(`set role ${role}`);
        try { await assert.rejects(db.query("select * from verify_attendance_scan($1::uuid,$2,'scanner')", [fresh.id,fresh.token]),/permission denied/); }
        finally { await db.exec("reset role"); }
      }
      await db.exec("set role service_role");
      try { assert.equal((await scan(fresh,pm)).status,"ALREADY_USED"); } finally { await db.exec("reset role"); }
    });
  } finally { await db.close(); }
});

test("admin filters and CSV distinguish AM-only, PM-only, both, and neither", () => {
  const a={scanned_at:am,am_scanned_at:am,pm_scanned_at:null};
  const p={scanned_at:pm,am_scanned_at:null,pm_scanned_at:pm};
  const b={...a,pm_scanned_at:pm}; const n={scanned_at:null,am_scanned_at:null,pm_scanned_at:null};
  assert.deepEqual([a,p,b,n].filter(s=>matchesAttendance(s,"both")),[b]);
  assert.deepEqual([a,p,b,n].filter(s=>matchesAttendance(s,"am_only")),[a]);
  assert.deepEqual([a,p,b,n].filter(s=>matchesAttendance(s,"pm_only")),[p]);
  assert.deepEqual([a,p,b,n].filter(s=>matchesAttendance(s,"not_attended")),[n]);
  const fields=attendanceFields({...b,am_scanned_by:"scanner",pm_scanned_by:"admin-id"},new Map([["scanner","Gate One"]]));
  assert.equal(fields.am_scanned_by_name,"Gate One"); assert.equal(fields.pm_scanned_by_name,"Admin Desk");
  assert.deepEqual(sessionCsvCells(fields),["Yes","2026-10-20 11:59:59 +08:00","Gate One","Yes","2026-10-20 12:00:00 +08:00","Admin Desk","Yes"]);
  assert.match(formatAttendanceTime(pm),/12:00:00\s*pm/i);
});
