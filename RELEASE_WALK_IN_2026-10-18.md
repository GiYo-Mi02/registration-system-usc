# Walk-in registration production release

Released October 18, 2026 (Asia/Manila).

- Production: https://registration-system-usc.vercel.app
- Student entry: https://registration-system-usc.vercel.app/register
- Vercel project: `registration-system-usc` / `prj_hPBrxMeoqMN6hf4r6fmmTmMcaP3C`, owner `gios-projects-3389c3d5`.
- Deployment: `dpl_4Ur8No9RpWLZjcoQAf942kgv4r3t`, target **production**, status **READY**. The checked production build was explicitly promoted to the main production domain.
- Supabase project: `frgxvvktenjwwuflfnal` (existing project name `orgfee`; only the registration-system migration was applied).
- Migration: `20261018102618_student_walk_in_registration.sql`, applied transactionally and recorded in `supabase_migrations.schema_migrations`.
- Source: current workspace changes based on Git commit `64c3a873a06dc50a12381d36f19dcfa216b6a447`; this was a Vercel CLI release from the working tree, not a GitHub push.

## Preservation and backup

Before migration: 2 events, 76 participants, 76 QR records, 76 attendance rows, 76 saved ticket/email records and 19 check-ins. Counts were unchanged immediately after migration. At the final check, the database contained 77 participants, 19 check-ins and one event open for walk-ins; the release smoke tests submitted zero participants and did not open an event.

An encrypted backup of the five registration tables was saved locally and its decryption was verified before migration. Backup metadata is in `scratch/production-release/backup-metadata.json`. The encrypted file is in that directory; its separate key file is in the ignored `.vercel` directory. Both locations are excluded from deployment and Git. Preserve both files for recovery, and do not publish the key or raw backup contents.

## Hosting adjustment

The initial upload exposed a deployment-file selection problem in a dry run; no environment files were deployed by this release. `.vercelignore` now explicitly excludes environment files, CSV data, caches, generated builds and local test/backup artifacts.

The first staged build was rejected because 14 functions exceeded the existing Hobby plan's 12-function limit. Public event listing, walk-in registration and authenticated ticket preview now share one Vercel dispatcher, with their original URLs preserved through rewrites. The corrected build contains 12 functions; no hosting-plan upgrade was made.

## Verification

- **58 automated tests passed**, including isolated PostgreSQL migration/rollback tests and grouped-route permission checks. Strict TypeScript checking and the hosted production build passed.
- **16 staged endpoint checks passed** against production configuration: public listing and deep links, invalid-input rejection, unknown-receipt handling, protected APIs and `.env` denial.
- **11 final public-site checks passed**, including a clean desktop/mobile browser, student entry, all six form fields, direct-link refresh and browser navigation. No participant registration was submitted during these live checks.
- Earlier isolated full-flow browser verification passed **20 checks**, including QR download, existing scanner image decoding, duplicate/wrong-event rejection, lost-response recovery, directory/export and bulk-email exclusions.
- Main domain resolved to the promoted deployment. No browser runtime errors were observed. The deployment request-log query returned **zero HTTP 500-class responses** for the checked 15-minute window ending at `2026-10-18T10:59:57Z`.
- Runtime logs contained three Node `DEP0169` URL-parser deprecation warnings on stderr, with no application exception observed in the inspected records. These warnings were not suppressed.
- Supabase security advisors returned 12 warnings on other existing objects and zero warnings naming the newly added walk-in table/functions. Existing notices include [mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) and [public execution of security-definer functions](https://supabase.com/docs/guides/database/database-linter). Those unrelated objects were not changed by this release; this is not a full-database security sign-off.

Physical phone-camera performance, Safari behavior and multi-connection load testing remain outside the evidence above. Existing scanner cooldowns and scanning configuration were not changed.
