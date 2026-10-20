# Student walk-in registration

Students enter through **Register as a Walk-In** on the homepage, choose an open event, read the privacy notice and explicitly agree, enter Name, Email, College, Program, Year and Section, review their details, then receive a downloadable admission QR. Registration saves a participant; committee scanning records attendance. There is no student account or automatic email.

The same QR supports one AM and one PM check-in per event. Before 12:00 noon Philippine time counts as AM; from noon counts as PM. The database chooses the session using its clock. Repeats within a session remain duplicates. Existing timestamps are classified by their recorded Philippine time; the system cannot reconstruct PM attendance that was never recorded. The AM/PM extension is migration `20261020054714_attendance_am_pm_sessions.sql`, applied after the walk-in migration. Admins can inspect both sessions and export their times and stations.

## Privacy agreement before the form

Direct event links and event-card navigation show the privacy notice before any participant inputs are rendered. The checkbox starts unchecked; **I agree and continue** stays disabled until it is checked. **Decline and return to events** clears that event's local draft/receipt. Consent is scoped to the event, browser tab, and notice version; an old draft without current consent must show the notice again. Existing issued tickets remain recoverable without a new registration or forced re-consent. The form offers **View privacy notice** to read it again.

The notice references [Republic Act No. 10173, the Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/). It describes the six collected fields, event registration/QR/attendance purposes, confidentiality and restricted access, and privacy rights. The user-confirmed privacy contact is [ggonzales.k12254495@umak.edu.ph](mailto:ggonzales.k12254495@umak.edu.ph), with the committee assistance desk available at the venue. It does not guarantee that a security breach is impossible or claim a completed legal compliance review.

The seven-day retention period is the organizer's stated policy, not a retention period mandated by RA 10173. The user confirmed that the deletion scope is **walk-in registrations only**, including their related QR, attendance and saved ticket records. **There is no automatic deletion scheduler in this version.** Event dates are currently display text, so a deletion deadline must not be guessed from them. Organizers must arrange deletion seven days after the confirmed event end and handle organizer-held exports/backups consistently with that commitment. A production retention rollout still needs a confirmed event end time and backup policy. No existing participant data is deleted by this UI change.

The agreement is remembered in session storage so the UI can gate the form; it is not a server-side consent audit record or an API authorization mechanism. The notice version was updated when the walk-in-only retention scope and privacy email were confirmed.

## Database setup and release order

1. Back up the intended database and test the change in a staging copy first. Confirm that its existing registration schema includes the prior student-year and email-delivery migrations.
2. Apply **only** `supabase/migrations/20261018102618_student_walk_in_registration.sql` to that existing database using your migration process or the Supabase SQL editor. It is a transactional, once-only migration. Do not reapply the schema export or reset existing records.
3. Build and serve the updated application (`npm.cmd run build`, then `npm.cmd start` for Express), or deploy it through the existing Vercel process. Apply the database change before exposing the updated application. The existing production project was updated on October 18, 2026; see [the production release record](RELEASE_WALK_IN_2026-10-18.md). These setup steps remain applicable to other databases and future installations.
4. Sign in as administrator. Each event starts with **Walk-ins: Closed**. Click **Open Walk-In Registration**, then **Copy Registration Link** to share `/register/<event UUID>` or use it in a venue poster. Close registration when appropriate. Staff scanning of already-issued tickets continues after closing.

Without the new migration, public registration returns an unavailable message rather than creating partial records. Leaving walk-ins closed disables new public registrations without deleting tickets. Retain the additive schema when rolling back application code.

## Interfaces and privacy

- `GET /api/public-events[?eventId=<UUID>]`: public event details for open events only. No student or staff records.
- `POST /api/walk-in-registration`: JSON containing `eventId`, `full_name`, `email`, `college`, `program`, `year`, `section`. A cryptographically random 64-character hex secret is supplied in `X-Registration-Key`.
- `GET /api/walk-in-registration?eventId=<UUID>`: the same secret header restores only that browser session's ticket, even after registration closes. No lookup by email is provided.
- `PATCH /api/events?id=<UUID>`: authenticated administrator request with `{ "walk_in_open": true }` or `false`.
- Successful registration/recovery returns `{ success: true, ticket: { full_name, event, qr_data_url, scanned_at } }`. Invalid input is 400, unknown receipt 404, closed/duplicate registration 409, throttling 429 with `Retry-After`, and temporary database failure 503.

Email is trimmed and normalized to lowercase; all six fields are required and bounded. The transaction preserves the existing event/email unique index. Student, QR, unscanned attendance and saved ticket preview either all save or all roll back. Replaying the same receipt returns the original ticket rather than issuing a replacement, including after a lost network response. A different receipt using an existing email is directed to the assistance desk without receiving its QR.

Only a server-keyed receipt hash is saved in the database. The raw secret and draft stay in `sessionStorage`, never in URLs. Refreshes in the same tab can recover the ticket. **Finish / Clear ticket** removes the local session; browser back navigation also checks for cleared tickets. Closing the tab removes ordinary same-tab recovery. Participants should download their QR before clearing or leaving a shared device. Staff can use the existing authenticated ticket preview to assist someone who loses their copy.

Walk-in receipts use `delivery_status = 'not_requested'`. The legacy `email_status` column remains compatible with existing constraints; display, totals, filters and exports use the explicit delivery status. Bulk dispatch, bulk resets and automatic import emails exclude these records. An individual, explicit staff resend remains available and updates the delivery state normally. No email transport is called by public registration.

## Request limits and permissions

`WALK_IN_RATE_LIMIT` defaults to **120 create/recovery requests per trusted client IP per minute**. Set a positive integer up to 100000 if venue traffic requires a different limit. The counter is stored in PostgreSQL, so it is shared across server instances. Only an HMAC of the IP is persisted; expired counter rows are pruned in bounded batches. The limit counts failed/unknown receipt requests as well as successful registrations. Shared venue networks share the same IP allowance.

Express uses its connection IP and the existing `TRUST_PROXY_HOPS` setting. Configure proxy trust only for the real deployment topology. Vercel uses its platform-provided `x-vercel-forwarded-for` header only inside the Vercel runtime; missing/invalid platform addresses fall into a shared fallback bucket. Do not expose a self-hosted server with arbitrary forwarded-header trust.

New counters have RLS enabled with no anonymous policies. The three registration/counter functions use `SECURITY INVOKER`, an empty search path and service-role-only execution. Privileged Supabase access and QR signing remain on the server. Existing staff APIs stay authenticated.

On Vercel, the public-event, walk-in-registration and authenticated email-preview URLs are rewritten to one `api/registration.ts` dispatcher. The preview handler retains its administrator check. This keeps the deployment at the existing Hobby plan's 12-function limit without changing client URLs. `.vercelignore` excludes environment files, CSV data, caches and local test/backup artifacts from uploads.

## Verification

Run `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`. The development-only PGlite dependency runs an isolated PostgreSQL engine in memory. Its fixture uses the saved schema and the new migration; it never loads `.env` or connects to production. PostgreSQL's built-in UUID generator replaces the fixture's pgcrypto extension installation.

Automated tests cover field validation, closed events, imported-email conflicts, repeated submissions, failure injection at each of the four write stages, receipt scoping, restricted roles, shared request limits, and valid/duplicate attendance scans. The existing regression suite also checks committee denial for the new administrator PATCH.

Local headless Chromium verification used the real React build and Express handlers with an isolated PostgreSQL adapter. It verified mobile form/review/edit, QR PNG download, recovery after closing, Finish and browser back, committee QR-image decoding, duplicate and wrong-event rejection, the administrator directory and CSV export. This does not establish physical phone-camera performance, Safari compatibility, hosted Vercel behavior, or multi-connection PostgreSQL contention; rehearse those on staging before event use. PGlite serializes queries in one database instance, so parallel submission tests are not a production concurrency benchmark.

Scanner cooldowns, camera settings and scan-verification latency were not changed by this feature.
