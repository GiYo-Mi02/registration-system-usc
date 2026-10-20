# AM / PM attendance production release

Released October 20, 2026 (Asia/Manila) to https://registration-system-usc.vercel.app.

## Behavior

- Existing signed QR codes accept one AM and one PM check-in per event. No QR token or signing secret was replaced.
- The database clock determines the session: before 12:00 noon Asia/Manila is AM; from noon is PM. Client clocks and caller-provided session labels do not determine attendance.
- A row lock serializes scans for an attendee. Duplicate responses identify the session and retain its first timestamp and station.
- Admins see separate AM/PM columns, check-in times in Philippine time, stations, session totals, and filters for AM, PM, both, AM only, PM only, any session and absent.
- CSV exports retain the first six import columns and existing audit fields, then append AM/PM status, local timestamps with +08:00, stations and a both-sessions flag.
- Historical first scans are preserved and classified by their recorded local time. Missing second-session attendance is not inferred. Existing event behavior is retained; attendance does not reset automatically on a new calendar day.

## Database preservation

Migration: `supabase/migrations/20261020054714_attendance_am_pm_sessions.sql`, recorded transactionally in Supabase migration history for project `frgxvvktenjwwuflfnal`.

Before migration, an AES-256-GCM backup of the five registration tables plus the prior scanner function was encrypted locally and its decryption verified. It contained 1,253 student, QR, attendance and email/ticket records, two events and 672 check-ins. Every backed-up QR record and every previously recorded attendance timestamp and station was compared with production after migration and preserved. Real registrations continued during the release; the first post-migration check had 1,259 attendance rows and 673 check-ins (662 AM, 11 PM).

Backup metadata and verification artifacts are in ignored `scratch/am-pm-release-2026-10-20/`. The separate key is in ignored `.vercel/`. Keep both private and preserve them together for recovery. They are excluded from deployment.

## Verification

- 68 automated tests passed, covering schema backfill, the exact noon boundary, existing tickets, same-session duplicates, PM-only attendance, first-scan preservation, role restrictions, walk-in transactions, admin filters and CSV fields.
- TypeScript and production builds passed.
- Seven isolated browser checks passed against actual Vercel handlers with an in-memory PostgreSQL adapter: historical states, filters, original QR-image decoding for PM, duplicate response, both-session display, CSV download and mobile layout. No unexpected browser errors.
- Nine production checks passed on the public domain, using one temporary closed test event. Four concurrent requests with its unchanged AM QR returned exactly one valid PM scan and three PM duplicates. The admin API and browser showed both timestamps and stations; CSV download and desktop/mobile rendering passed. The test event and its participant, QR and attendance records were removed, and the verification login was signed out. No email was sent.
- Scanner RPC remains `SECURITY INVOKER` with an empty search path, denied to public/anonymous/authenticated roles and executable by service role.
- Security advisors show the expected informational notice that attendance RLS has no public policies: this is intentional for the service-role-only server access model. No warning names the scanner RPC. Existing notices on unrelated database functions/auth configuration were not changed. See [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Production was first staged and promoted as `dpl_ChQo1j3sVw3KMTsKMxUEs9tqQaB6`. The final production deployment is **`dpl_AEuHmM7wyqho2EhLCXJi8z2hrn4s`**, status **READY**, explicitly promoted to the main public domain. It also corrects the older single-use instructions on the scanner and walk-in ticket to the AM/PM rule.

The final public build was checked at 14:09 Philippine time: the served scanner/walk-in bundles contain the new session wording, the authenticated admin ledger displays both session columns, and session totals match the exact registry response rendered by the browser. No browser runtime errors were observed. Verification artifacts are in `final-verification.json` and `production-session-summary.png` under the ignored release directory. Production records were read without changing attendance during this final check.

The live concurrency check verifies one attendee under four overlapping requests; it is not a venue-wide capacity benchmark. Physical camera/Safari performance was not remeasured.

## Recovery

Keep the additive session columns and recorded attendance when reverting application code. Do not reset scans, rotate QR_SECRET, or regenerate tickets. The backup includes the original function definition for deliberate recovery, but reverting to its one-check-in behavior would stop second-session acceptance. Coordinate any database-function rollback with the application release.
