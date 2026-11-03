# Participant check-in production release — November 3, 2026

Production: https://registration-system-usc.vercel.app

Deployment: `dpl_6BcWfqund3Tsuz9itJzpB6vdFE1k`, built as a staged production deployment and promoted after API verification. Source was the local feature working tree based on `d7fe0cb`; this release did not push a Git commit. The final deployment uses a string glob for Vercel function `includeFiles`.

Git synchronization follow-up: the public repository excludes private roster files, credentials, backups and committee code exports. Admin roster review now reads the protected production database, and automated tests use fictional participants. The optional local bootstrap file is also excluded from future deployment uploads.

## Database and roster

- Verified database target: `frgxvvktenjwwuflfnal`.
- Applied migration `20261103132203_participant_roster_check_in` and recorded its source in migration history; refreshed the API schema cache.
- Created **IT SKILLS OLYMPICS**, event ID `956b6179-228b-4e36-ab59-f538650b8125`.
- Imported **100 participants from 50 schools**. Generated **three unique committee codes** for missing school IDs.
- Initial real-event attendance: **zero time-ins**.
- Participant check-in and new walk-in registration for this event remain **closed**. An admin can open roster check-in under **Participant time-ins → Roster setup & committee codes**.
- Event date: **November 4, 2026**. Venue: **Admin Building 6th Floor UPAT**. These user-supplied details were saved after release and verified through the live production event API. Description and artwork remain blank. Existing events retain their original metadata and availability.

The real participant page is https://registration-system-usc.vercel.app/register/956b6179-228b-4e36-ab59-f538650b8125?checkin=1 . It reports that check-in is closed until opened by an admin.

## Preservation and access checks

An encrypted AES-GCM backup was created and its decryption verified before migration. Backup metadata and the separate ignored local key remain under `scratch/roster-production-2026-11-03` and `.vercel` respectively. Never upload the key or backup as public application assets.

After migration, import, production testing and cleanup, every original row in `events`, `students`, `qr_tokens`, `attendance` and `email_log` matched the backup. The only event-schema difference on original events is the new closed-by-default roster flag. All **1,363** original students, QR tokens, attendance records and email records remain unchanged.

Both new tables have RLS enabled and deny reads to `anon` and `authenticated`. The server role can read them. Both new RPCs use invoker permissions, a fixed search path and server-role-only execution. Post-migration security advisors reported no roster/check-in findings; 12 unrelated existing advisories remain outside this release's scope.

## Runtime verification

Five staged production API verification groups passed, including authenticated access to the bundled private source and actual imported roster, anonymous denial, and a temporary synthetic event. Its lookup created no attendance; four concurrent confirmation requests returned the same receipt/reference/database timestamp. Code lookup and receipt recovery after closing passed. The temporary event, roster and check-in were deleted, and the test admin session was logged out.

Five public production browser/API verification groups passed with **zero page errors**:

- Updated participant entry link on the production homepage.
- IT SKILLS OLYMPICS defaults to the participant time-ins admin view, showing 100 roster members and zero attendance.
- All three private committee codes display and download successfully.
- Mobile admin fits the screen; actual event check-in stays closed.
- The previously open walk-in event remains available.

Local verification from implementation also passed: **81 automated tests**, production client/server build, and **10 isolated browser flow checks**. No real participant attendance was submitted during release verification.

Ignored detailed evidence: `scratch/roster-production-2026-11-03/` contains preservation metadata, staged/live results and screenshots. The committee code CSV is private operational data and must be distributed only to authorized committees.
