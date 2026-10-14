# Registration system audit and repair report

Audit date: **14 October 2026 (Asia/Manila)**.

## Outcome

The supplied React/JSX diagnostics are resolved across the project. Strict TypeScript checking passes for frontend, backend, serverless handlers, and regression tests. Local development and built production HTTP checks passed. **This is not yet a production-readiness sign-off:** the current local credentials fail the new production minimum requirements, and the remaining release work is listed below.

The architecture remains React/Vite + Express for local or persistent hosting, with separate Vercel API handlers and Supabase persistence. No deployment was published and no database migration was applied during this repair.

## Scope and evidence limits

Reviewed the dependency/configuration files, frontend components and API helpers, Express routes/middleware/email helpers, all twelve Vercel handlers, and the SQL migrations/schema export. The pasted IDE errors were used to reproduce the TypeScript failure under strict checking.

Verification used Node **24.12.0**, npm **11.6.2**, compiler/build commands, mocked database regression tests, and HTTP checks against local servers. The development server loaded the existing local environment; production serving was tested with temporary test-only environment overrides and an unreachable database URL. Credential values are not included in this report.

There was no connected browser, and opening the in-app browser returned `Browser is not available: iab`. Therefore, responsive layout, interactive navigation, real camera scanning, and Safari/iPhone behavior were not visually verified. Database authorization/QR tests use mocks; they do not prove the current live database schema, concurrency behavior, or grants. Actual SMTP delivery and a hosted Vercel deployment were not exercised.

## Fixed findings

### F01 — Missing React types caused cascading JSX errors — High, fixed

`package.json` lacked `@types/react` and `@types/react-dom`. The JSX markup itself was not the primary cause of TS7016, TS7026, and the contextual event typing errors. The old non-strict `npm run lint` passed even with missing declarations.

Installed React 19 type declarations, enabled `strict` and `noUncheckedSideEffectImports`, and added `src/vite-env.d.ts` for Vite/CSS module declarations. The compiler now checks explicit source directories instead of accidentally including generated output. No blanket `declare module 'react'` or artificial JSX index signature was added.

### F02 — Additional errors hidden by the old check — Medium, fixed

Corrected the admin refresh callback return type, scanner result `time_string` declaration, Nodemailer inline attachment literal types, and Express rate-limit declarations/message types. `npm run build` now runs type checking before producing artifacts.

Files: `src/components/AdminPanel.tsx`, `src/components/ScannerPanel.tsx`, `server/helpers.ts`, `server/middleware.ts`, `package.json`.

### F03 — Scanner sessions could perform administrator actions on Vercel — Critical, fixed in source

Several serverless endpoints checked only that a session existed. A scanner bearer token could reach event mutation, registration, resend, email reset, student deletion, email preview, and database reset operations.

Added `server/serverless-auth.ts` and `server/session.ts`. Administrator access is now derived from the stored session rather than the browser role. The full student registry is administrator-only. Scanners retain event listing and authenticated QR verification. Regression tests exercise every affected admin endpoint with a scanner session and expect HTTP 403 before business-data access.

These repairs require deployment to affect a previously hosted version.

### F04 — Session expiry and inactive account checks differed across hosts — High, fixed in source

Shared session validation now rejects missing sessions, invalid/future heartbeat timestamps, sessions inactive for over five minutes, and disabled scanner accounts. Database lookup or heartbeat persistence failures deny access. Express and serverless endpoints use the same validation logic; serverless heartbeat no longer validates only session existence.

The legacy Express SSE route also uses authentication on connection. Its longer-term limitations remain listed in R08.

### F05 — Development mode exposed student records and signed tickets to scanners — High, fixed

Removed development-mode role bypasses from Express registry and student-token retrieval. Both require administrator access regardless of hosting mode.

The frontend no longer polls or displays the full registry attendance totals for scanner accounts. Scanners see only the check-in workflow and information returned for their scanned ticket.

### F06 — Login could return success even when session storage failed — High, fixed

Both login implementations now check session insertion errors before returning a token. Session row IDs use random UUIDs rather than millisecond timestamps. Login validates credential types, lengths, and supported roles. Removed scanner debug logging that printed the complete user row, including its password hash.

Files: `api/login.ts`, `server/routes.ts`.

### F07 — Default credentials and signing secret were silently accepted — High, fixed with configuration blocker

Removed the automatic administrator password and QR signing-secret fallbacks. Startup requires the database URL/key, administrator username/password, and QR secret. Production requires a QR secret at least 32 characters long and an administrator password at least 12 characters long; `admin123` is explicitly rejected. These length checks are minimum requirements, not an entropy measurement.

The existing local configuration was rejected by the production check. Values were left unchanged. See R01 before production use.

### F08 — Destructive demo reset was available in production — Critical, disabled

`/api/reset-db` now requires an admin session and explicit `ENABLE_DEMO_RESET=true` in development. It is denied in production and on Vercel even when that flag is true. The default is false. The development-only reset implementation still contains demo account hashes and must only be used against disposable data.

### F09 — Production start selected the development hosting branch — High, fixed

The old `npm start` did not set `NODE_ENV=production`, so the built server could enter the Vite development middleware branch. `scripts/start.mjs` now sets production mode before importing the server bundle.

### F10 — Backend bundle/source map shared the public output directory — High, fixed

The old build placed `server.cjs` and its source map inside `dist`, which Express serves publicly. Server artifacts now go to `build/`; `dist/` contains only frontend artifacts. HTTP requests for those old filenames returned the SPA HTML fallback, and neither file exists in the final public output.

Vercel uses `npm run build:client` so its static output contains only the frontend; the `api/` handlers remain platform functions.

### F11 — Clean command was incompatible with PowerShell and removed application data — Medium, fixed

Replaced `rm -rf dist db.json` with a portable Node script that removes only generated `dist/` and `build/` output. It preserves application records.

### F12 — Failed fetches appeared as successful empty registries — Medium, fixed

`fetchEvents` and `fetchStudents` now propagate failed responses rather than returning an empty list. Registry sync retains its last usable data on a failed request and displays a disconnected status. Request generations prevent responses from a previously selected event or logged-out session from overwriting current registry state. Polling waits for a request to finish before scheduling the next refresh, at a 15-second interval.

Cached authentication receives basic shape validation. Server authorization remains authoritative. Logout clears local UI state before waiting for network revocation.

### F13 — CSV exports allowed spreadsheet formula execution — Medium, fixed

Added `src/lib/csv.ts`, used by client and Express CSV exports. It quotes embedded quotation marks and prefixes cells starting with formula markers or hazardous leading whitespace/control characters. Exported values such as `=HYPERLINK(...)` are treated as text by common spreadsheet applications.

### F14 — Excessively broad response policies — Medium, improved

Removed wildcard CORS origins from serverless handlers, matching the existing same-origin frontend. Authenticated responses use `Cache-Control: no-store`. Vercel camera access is scoped to the same origin, microphone is disabled, and nosniff/referrer headers are configured. Email previews use an opaque sandboxed iframe without script or same-origin privileges.

Express disables its framework identifier, accepts a 1 MB JSON body limit, supports explicit trusted proxy hops, and returns JSON 404s for unknown API endpoints before SPA fallback. This is not a complete CSP or abuse-prevention implementation.

### F15 — Vulnerable dependencies and an oversized initial bundle — High/Medium, improved

Applied compatible dependency security fixes and updated Nodemailer to **10.1.1**. A JSON transport test verified the template and inline delivery attachments with that release without sending mail. The current cybersecurity template uses only the QR attachment; legacy artwork handling remains compatible with old stored emails.

The initial JavaScript entry was about 651 KB minified. Admin and scanner screens now load separately: the final measured entry was about **234 KB**, the admin chunk **57 KB**, and scanner chunk **359 KB**. The previous 500 KB build warning is eliminated without increasing the warning threshold.

At the final advisory check:

- Production dependency tree: **0 advisories** using `npm audit --omit=dev`.
- Full dependency tree: **11 advisories — 10 high, 1 moderate**.
- The remaining reported packages are `@fastify/busboy`, `@ts-morph/common`, `@vercel/node`, `@vercel/static-config`, `ajv`, `braces`, `fast-glob`, `micromatch`, `path-to-regexp`, `ts-morph`, and `undici` in the development/build dependency tree.

This measures npm's advisory data at audit time, not the absence of every possible vulnerability. See R05.

## Remaining work and release gates

### R01 — Production credential configuration — High, confirmed blocker

The current environment fails the production QR-secret/password minimum check. Configure a unique, cryptographically random signing secret and administrator password in the production environment. Do not put privileged keys in `VITE_*` variables or frontend source.

Changing `QR_SECRET` makes tickets signed with the previous secret fail HMAC verification. Coordinate any change with ticket regeneration/reissue or a deliberately designed transition mechanism. An audit alone does not authorize rotating existing tickets or secrets.

Acceptance: production configuration passes validation; a staging login persists a usable session; its issued QR verifies using the same signing configuration.

### R02 — Registration/import and destructive operations are not transactional — High, open

`server/routes.ts`, `api/manual-add.ts`, and `api/import-csv.ts` create student, QR, attendance, and email-log records in separate calls. Several related writes ignore Supabase's returned `error`. A partial failure can leave a student with missing ticket/attendance/log rows, while a retry finds an existing registration. Email-status resets and manual cascade deletion also involve multiple calls with unchecked intermediate failures.

Move related database writes into tested transaction/RPC operations, or use verified cascade constraints for single-call deletion. Report every failed write and define idempotent retry behavior. Add failure-injection tests and migration verification against an isolated staging database before changing live persistence behavior.

Acceptance: interruption at each write produces either a complete registration or a rollback; retries recover safely without duplicate email submissions or missing attendance records.

### R03 — Serverless login abuse protection — High, open

Express has a login limiter, but `api/login.ts` has no shared rate limiter or lockout mechanism. The Express limiter's default in-memory state also resets on restart and does not coordinate multiple instances. The exported `apiLimiter` is not mounted. Proxy trust must reflect the actual trusted proxy topology.

Configure platform/shared-store throttling for login and sensitive endpoints, with account/IP controls and tests. Do not assume an instance-local map is sufficient protection on Vercel.

Acceptance: repeated failed attempts are throttled across concurrent instances, legitimate scanner traffic remains usable, and spoofed forwarded IP headers do not bypass the policy.

### R04 — Database provisioning and live permissions are unverified — High, open

The migration directory starts with changes to existing tables; it lacks a complete initial schema migration. `supabase/config.toml` references `supabase/seed.sql`, which is absent. A clean local reset is therefore not a demonstrated setup path.

The SQL export is a September 2026 snapshot, not a current live inspection. It enables RLS, contains no table policies, and grants broad privileges to `anon`, `authenticated`, and `service_role`. The application uses a service-role key and custom sessions; table RLS does not enforce application roles for those server calls. Function execution revocations are present for the scanner and email-recorder RPCs in the reviewed SQL.

Create and verify a complete reproducible baseline, review current table grants/RLS/RPC privileges with database advisors, remove unnecessary public-role grants, and preserve server-side role checks. Do not infer live anonymous data exposure solely from broad grants when RLS is also enabled.

Acceptance: a new isolated database provisions successfully and tests deny anonymous/authenticated access to sessions, password hashes, tickets, and student records while server workflows succeed.

### R05 — Development/build dependency advisories — High, open

Eleven advisory entries remain under the Vercel development/build tooling. npm proposes a forced `@vercel/node` version change; this was not applied blindly. Evaluate an upstream fix or supported tooling version and verify serverless builds in CI. No report should describe the full dependency tree as vulnerability-free.

Acceptance: resolve the advisories or record a reviewed risk decision with affected versions, exposure paths, compensating controls, and an upgrade deadline.

### R06 — Email retries and serverless time budget — High, open

SMTP is performed synchronously inside requests. Five-recipient batches reduce timeout risk but cannot guarantee finishing within the configured 60-second function window during slow SMTP/network responses. Quota state is process-local. Concurrent resend requests lack a durable shared delivery claim, so duplicate submissions remain possible.

Use a durable queue/outbox with idempotent claims, bounded provider timeouts, retry accounting, and persistent quota handling. SMTP acceptance is already tracked separately from simulation; it does not prove inbox delivery. Verify a real recipient delivery in staging, including provider-domain configuration and bounce handling.

Acceptance: request interruption or simultaneous retries cannot submit duplicate messages; receipt storage and actual recipient delivery are verified.

### R07 — Input validation and CSV parsing — Medium, open

Several handlers only test that values are present. Add shared validation for UUIDs, email addresses, URLs/protocols, field lengths, array item types, and bounded import sizes. Normalize emails consistently before duplicate lookup. The CSV importer handles quoted commas within a line but splits the file on newlines first, so quoted multiline cells are unsupported; invalid rows can be skipped without a row-by-row error report.

Acceptance: malformed payloads produce consistent HTTP 400 responses without writes; CSV validation reports rejected rows and supports the intended spreadsheet format.

### R08 — Session lifecycle and legacy SSE — Medium, open

Custom bearer tokens are stored in sessionStorage and plaintext database session rows. Browser heartbeats can extend inactivity indefinitely; there is no absolute lifetime, administrator MFA, session inventory, or explicit single-login enforcement. The UI's claim that a session may be superseded is not backed by an enforced one-session-per-operator rule.

The unused-by-current-UI SSE route accepts a token in the URL, keeps process-local clients, and authenticates at connection time. It has no continuing revocation check or cross-instance broadcast coordination. Remove it after confirming no external consumers, or redesign it with revocation and a supported streaming topology.

Acceptance: session policy is documented and implemented; revocation reliably stops access, including open streams. Consider hashed session-token storage and secure cookie-based sessions as part of that design.

### R09 — Scale, error recovery, and user experience — Medium, open

The admin screen still refreshes the full registry every 15 seconds. Large events should use paginated queries and lightweight counts/deltas rather than repeated complete transfers. The legacy Express export fetches one unpaginated Data API response and may truncate at the configured 1,000-row limit; use the already paginated registry/client export until that endpoint is repaired.

Transient heartbeat/network failures currently sign the user out rather than distinguish service outage from revoked credentials. More comprehensive cache shape validation, storage-failure handling, accessible modal focus/labels, and real device camera lifecycle checks remain useful. Old delivered emails can contain the previous event-specific artwork; newly generated tickets use the current design and event settings described below.

Acceptance: test event-size and simultaneous-scanner targets, network loss/recovery, accessible keyboard interaction, and iPhone/Android camera workflows.

### R10 — Hosted release, CI, backups, and observability — High, unverified

No public deployment, live database advisor check, load test, CI execution, real SMTP delivery, or backup/restore rehearsal was completed. Local build success and mocked API tests cannot establish hosted readiness. The parallel Express/serverless business implementations remain a maintenance risk even though authentication is shared.

Acceptance: CI runs clean install, strict checking, tests, frontend/serverless builds, and advisory review. A staging deployment passes admin/scanner permission tests, successful and duplicate check-in, wrong-event/forged QR rejection, delivery and import flows, and recovery testing. Confirm a backup restoration before enabling destructive administrative operations in production.

## Hosting runbook

### Local development

1. Use Node 22.12+ or Node 24 within the declared supported range; Node 24.12 was tested.
2. Run `npm.cmd ci` on Windows.
3. Copy `.env.example` to `.env` and fill the required values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `QR_SECRET`.
4. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` for actual sending. Keep `SMTP_SIMULATE=false` for real delivery; explicit simulation produces a simulated receipt, not a delivered message.
5. Keep `ENABLE_DEMO_RESET=false`. Use a separate non-production Supabase project for development.
6. Run `npm.cmd run dev` and open `http://localhost:3000` unless `PORT` is overridden.

The web server is local; the database may still be hosted, depending on `SUPABASE_URL`. LAN HTTP access can display the app, but camera access on another device requires a secure context, normally trusted HTTPS. Localhost's exception does not make a LAN IP over HTTP secure. See [MDN camera requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

### Persistent production host

Run `npm.cmd run build`, then `npm.cmd start`. The entry point is `build/server.cjs` and the public root is `dist/`. Supply environment variables securely, place the host behind trusted HTTPS, supervise/restart the process, and configure `TRUST_PROXY_HOPS` only for the actual trusted proxy chain. The minimum production configuration check must pass first.

### Vercel

`vercel.json` builds the frontend with `npm run build:client`, publishes `dist/`, and configures the twelve `api/` handlers with a 60-second duration plus the required email artwork. Supply server-side environment variables for the correct preview/production scope. These handlers are separate from the long-lived Express server; uploading static files alone does not provide the API.

Confirm the project's Node runtime, plan/function allowances, actual serverless bundling, SMTP connectivity, and environment scopes in staging. Do not host the Express in-memory SSE client pool as if it were shared serverless state. Review [Vercel function limits](https://vercel.com/docs/functions/limitations) for the actual deployment configuration.

## Verification results

- `npm.cmd run lint`: **passed**, strict TypeScript across application/server/API/tests.
- `npm.cmd test`: **30 passed, 0 failed**. Database interactions are mocked; the Express checks use a local ephemeral HTTP server. Expected failure-path logs are deliberate test inputs.
- `npm.cmd run build`: **passed**; frontend chunks and isolated server bundle produced. Final source changes are covered by the closing build check.
- `git diff --check`: **passed**.
- Development HTTP checks on port 3100: root, source entry, and artwork **200**; missing-auth event/student/scanner APIs **401**; empty login **400**; unknown API **404 JSON**.
- Current-environment production startup: **rejected** weak QR-secret/password requirements as intended; this is a configuration blocker, not a successful production launch.
- Test-only production startup on port 3101: **passed**. Root and built JS/CSS **200**; missing-auth events **401**; unknown API **404 JSON**. The server bundle/source map were absent from public output.
- Public bundle inspection: no matching configured service-role key, administrator password, QR secret, or SMTP password was found among nonempty values of at least eight characters. This is a scoped scan, not a complete secret-history audit.
- Dependency advisory check: runtime **0**; full dependency tree **11** as described above.
- Browser rendering, real camera, actual mail delivery, live database permissions/concurrency, and hosted deployment: **not verified**.

The sandbox initially blocked npm network access, esbuild parent-directory resolution, and tsx Windows user information. These checks were rerun successfully with approved execution access; those sandbox errors were not treated as application defects.

## Reference documentation

- [Vite TypeScript behavior](https://vite.dev/guide/features.html#typescript): Vite's transpilation needs a separate compiler check.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): table grants, policies, and service-role bypass must be reviewed together.
- [Nodemailer usage](https://nodemailer.com/usage/): transport and message API used by the email smoke test.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): deployment constraints for synchronous handlers.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): secure context and camera-permission requirements.

The Supabase changelog Markdown URL was attempted but the web tool rejected its content type. Current RLS documentation was available; no new database API or schema change was implemented on the basis of an unread changelog.

## Ticket design follow-up — 15 October 2026

Replaced the game-themed ticket with a cybersecurity-style admission pass in `server/ticket-template.ts`. The supplied image was used only as a visual reference: its QR was not decoded, scanned, copied, or opened. Its event/session wording and partner logos were not substituted for the application's real event settings.

The design uses near-black navy (`#030817`), deep navy (`#071226`), cyan (`#77DDEB`), and metallic pale blue (`#B6E7F0`). It includes a strong event heading, terminal-style section labels, attendee details, event date/venue, a white QR area with a cyan frame, and arrival instructions. Inline styles and presentation tables provide email fallbacks; a small media query adjusts typography and QR sizing on narrow screens. The former game artwork is no longer part of newly generated tickets. Legacy artwork attachment handling remains available for older stored HTML.

Registration, CSV import, resend, and bulk resend continue using the shared template API. Both admin preview endpoints now render the current design from registration/event data using the saved QR image, with no database writes or email delivery. Existing delivered messages keep their original appearance. The admin modal labels this as the current design with a saved entry QR rather than a historical copy of a delivered email.

A self-contained sample is saved at [previews/cyber-ticket.html](previews/cyber-ticket.html). Run `npm.cmd run preview:ticket` to regenerate it. Its dummy QR contains only inert design-preview text and is not an admission ticket or web link.

Validation: strict TypeScript checking passed; **31 regression tests passed**, including saved-QR preservation with a read-only preview database and Nodemailer attachment compatibility. Production build and diff checks passed. Browser visual QA and actual email-client/device rendering remain unverified because the session has no available browser. No ticket emails were sent, no reference QR was followed, and no GitHub push was performed for this change.
