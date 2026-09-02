# Registration schema exports

This directory contains SQL-only schema artifacts for moving the registration
system to another Supabase project later. Student rows, authentication users,
stored secrets, and email credentials are intentionally not included.

`registration_system_schema.sql` was assembled from live Supabase CLI queries
against project `frgxvvktenjwwuflfnal` and updated on 2026-09-02. It includes the seven
registration tables (including student program, year, and section), constraints, the case-insensitive event/email index, RLS
state, table grants, the service-role-only attendance verification RPC, and the
SMTP delivery receipt fields/recorder RPC added for provider-level troubleshooting.

The CLI full-public-schema dump command was also attempted, but it requires
Docker Desktop in this environment. This scoped file uses the working linked
query path and intentionally excludes unrelated organization-fee tables.

For the later transfer:

1. Create and link the new Supabase project.
2. Apply this schema to the empty destination project.
3. Transfer table data separately and recreate environment secrets manually.
4. Verify RLS, grants, RPC execution, QR scanning, and email delivery before
   changing the application's Supabase URL and keys.
