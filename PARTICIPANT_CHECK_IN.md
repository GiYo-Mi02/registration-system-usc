# IT SKILLS OLYMPICS participant check-in

The existing `/register` portal now supports a participant-roster journey alongside walk-in QR registration. A participant enters their school ID, reviews the supplied details, explicitly confirms their presence, and downloads a PNG attendance receipt. The receipt contains their name, school, ID, program/year, event, server-recorded Philippine time and unique reference.

The admin **Participant time-ins** view lists confirmed check-ins only, refreshes every 15 seconds while visible, and exports the recorded time-ins to CSV. Roster setup and missing-ID codes are inside the separate expandable setup section. QR registration, email delivery and the AM/PM scanner ledger retain their existing behavior.

## Activate on an existing installation

1. Apply [the participant check-in migration](supabase/migrations/20261103132203_participant_roster_check_in.sql) to the intended Supabase database after the existing walk-in and AM/PM migrations. This migration starts participant check-in closed for every event. It does not import a roster or alter existing student/QR attendance records.
2. Deploy the updated frontend and backend together. Vercel keeps its existing function count: `/api/roster-check-in` is routed through `api/registration.ts`. Production roster review reads the protected database. Private participant files are excluded from Git and deployment uploads.
3. Sign in as an administrator and select **IT SKILLS OLYMPICS**. This event opens the Participant time-ins view by default. For other events, the existing registry includes a **Participant time-ins / School-ID check-in** button.
4. Expand **Roster setup & committee codes**. For an initial import, upload the supplied roster export or paste its spreadsheet rows. On the existing production installation, **Review supplied IT SKILLS OLYMPICS list (100 participants)** loads the already imported roster from the protected database. Review the rows before choosing **Import into IT SKILLS OLYMPICS**. This source is restricted to the event with that name, ignoring case.
5. Download the committee code list. Privately give the three generated codes to the corresponding participants after committee identity checking. The two Arellano participants have `No ID`, and one NU Fairview participant has a blank ID.
6. Choose **Open participant check-in** when attendees may check in. Share `/register` or the direct event link shown in setup: `/register/<event-id>?checkin=1`. Close check-in through the same setup control when finished.

Production migration, roster import and deployment were completed on November 3, 2026. See [the production release record](RELEASE_PARTICIPANT_CHECK_IN_2026-11-03.md). The real event is loaded with check-in closed; admins may open it when ready.

## Roster handling

The supplied roster contains **100 participants from 50 schools**. Continuation rows inherit their school and coach. Leading zeros in IDs remain strings. Corrupted pasted UTF-8 characters were repaired before import; missing COR/ID information remains missing. IDs annotated with `/No ID` retain their original displayed text; lookup accepts the ID portion before the annotation.

Admins can also upload CSV/TSV exports or paste spreadsheet rows with the original tab-separated layout. Named-column CSV accepts:

```text
full_name,school,program,year,school_id,cor,coach_name
```

Import is atomic and additive. Re-importing the same school/name preserves the participant's existing record, committee code and check-in; it does not replace fields or reset attendance. Source corrections should be reconciled deliberately before another import rather than renaming participants to create replacements.

## Attendance and recovery

- There is **one time-in per roster participant per event**. The separate QR scanner continues to record AM and PM sessions.
- Looking up an ID does not record attendance. Confirmation writes the receipt and timestamp using the database clock. The browser shows that timestamp in `Asia/Manila`.
- The database locks the participant row and enforces a unique check-in. Repeated confirmation returns the original receipt/reference/time. Closing check-in prevents new attendance and still lets a pending valid confirmation recover its existing receipt.
- The browser saves a pending confirmation before submission. Reloading recovers a committed result if the response was lost. A saved receipt remains available in the tab until cleared. Downloading it retains a separate phone/computer copy.
- Confirmation proofs expire after ten minutes. If one expires, look up the same school ID or committee code again. Duplicate prevention still preserves the original check-in.
- **Finish / Clear receipt** removes the tab's cached receipt for shared devices; it does not delete attendance.

## Access and runtime configuration

Only admins can review the imported source, import the roster, change availability, list codes or view/export time-ins. Public lookup returns only an exact matching participant. If an ID matches more than one participant, select the school to disambiguate; unresolved matches require committee help. The full roster and codes are excluded from frontend bundles and the public GitHub repository. An optional ignored `assets/participant-roster.json` file can bootstrap a local installation; Vite denies direct access to it, and deployment uploads exclude it. Automated tests use fictional participant fixtures.

Both new tables enable RLS and revoke all access from public/anonymous/authenticated database roles. The two database functions use invoker permissions and are executable only by `service_role`; privileged database access remains on the server. Confirmation uses an event/participant-bound signed proof. Public lookup/confirmation requests share the existing database-backed throttling mechanism.

`ROSTER_CHECK_IN_RATE_LIMIT` controls roster requests per client IP per minute (default **600**, allowing attendees on shared venue Wi-Fi). Existing `WALK_IN_RATE_LIMIT` stays separate. Configure trusted proxy settings accurately for Express deployments; Vercel uses its platform-controlled client-IP header.

## Verification evidence

- TypeScript, production client/server build and the automated regression suite passed: **81 tests**, including actual isolated PostgreSQL import/confirmation/permission checks and all existing QR attendance tests.
- **10 browser flow checks passed with zero page errors**, using the real grouped Vercel registration handler and an isolated in-memory PostgreSQL fixture: admin import, code issuance, participant lookup/review/confirmation, PNG download, reload/duplicate recovery, time-ins-only ledger/CSV, code-based check-in, automatic admin updates, mobile layouts, and anonymous/scanner access restrictions.
- A simulated dropped response after a committed confirmation recovered the same receipt on reload without adding another time-in.
- These checks do not establish production migration/deployment state or physical-phone download behavior. A phone/venue rehearsal remains appropriate before opening check-in for the event.
