-- Registration-system schema captured from linked Supabase project
-- frgxvvktenjwwuflfnal on 2026-09-01.
--
-- Scope: events, students, QR tokens, attendance, email logs, committee users,
-- committee sessions, and verify_attendance_scan(). No table data, Auth users,
-- secrets, Storage objects, or unrelated organization-fee tables are included.
-- Apply this only to a new/empty Supabase project.

begin;

create extension if not exists pgcrypto with schema extensions;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date text not null,
  description text not null,
  venue text not null,
  banner_url text not null,
  created_at timestamptz not null default now()
);

create table public.committee_users (
  id text primary key,
  username text not null unique,
  committee_name text not null,
  password_hash text not null,
  active boolean not null default true
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  email text not null,
  college text not null,
  form_response_id text not null unique,
  imported_at timestamptz not null default now(),
  email_status text not null
    check (email_status = any (array['sent'::text, 'failed'::text])),
  email_error text,
  program text
    constraint students_program_not_blank
    check (program is null or btrim(program) <> ''::text),
  year text
    constraint students_year_not_blank
    check (year is null or btrim(year) <> ''::text),
  section text
    constraint students_section_not_blank
    check (section is null or btrim(section) <> ''::text)
);

comment on column public.students.program is
  'Student academic program or degree, supplied during registration/import.';

comment on column public.students.year is
  'Student academic year level, supplied during registration/import.';

comment on column public.students.section is
  'Student class section, supplied during registration/import.';

create unique index idx_students_event_email
  on public.students using btree (event_id, lower(email));

create table public.committee_sessions (
  id text primary key,
  committee_user_id text not null,
  session_token text not null unique,
  last_heartbeat timestamptz not null default now()
);

create table public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scanned_at timestamptz,
  scanned_by text
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  status text not null
    check (status = any (array['sent'::text, 'failed'::text])),
  error_message text,
  sent_at timestamptz not null default now(),
  email_html text not null,
  qr_data_url text not null,
  delivery_status text not null default 'queued'
    check (delivery_status = any (array[
      'queued'::text,
      'smtp_accepted'::text,
      'failed'::text,
      'simulated'::text,
      'legacy_sent'::text
    ])),
  provider_message_id text,
  provider_response text,
  accepted_recipients text[] not null default '{}'::text[],
  rejected_recipients text[] not null default '{}'::text[],
  last_attempt_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

alter table public.events enable row level security;
alter table public.committee_users enable row level security;
alter table public.students enable row level security;
alter table public.committee_sessions enable row level security;
alter table public.qr_tokens enable row level security;
alter table public.attendance enable row level security;
alter table public.email_log enable row level security;

-- The linked project currently has no row policies on these tables. Its
-- server-side handlers use the service role, which bypasses RLS.
grant select, insert, update, delete, truncate, references, trigger
  on table public.events to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.committee_users to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.students to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.committee_sessions to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.qr_tokens to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.attendance to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.email_log to anon, authenticated, service_role;

create or replace function public.record_email_delivery_attempt(
  p_student_id uuid,
  p_status text,
  p_error_message text,
  p_delivery_status text,
  p_provider_message_id text,
  p_provider_response text,
  p_accepted_recipients text[],
  p_rejected_recipients text[],
  p_email_html text,
  p_qr_data_url text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  insert into public.email_log (
    student_id, status, error_message, sent_at, email_html, qr_data_url,
    delivery_status, provider_message_id, provider_response,
    accepted_recipients, rejected_recipients, last_attempt_at, attempt_count
  ) values (
    p_student_id, p_status, p_error_message, now(), p_email_html, p_qr_data_url,
    p_delivery_status, p_provider_message_id, p_provider_response,
    coalesce(p_accepted_recipients, '{}'::text[]),
    coalesce(p_rejected_recipients, '{}'::text[]), now(), 1
  )
  on conflict (student_id) do update
  set status = excluded.status,
      error_message = excluded.error_message,
      sent_at = excluded.sent_at,
      email_html = excluded.email_html,
      qr_data_url = excluded.qr_data_url,
      delivery_status = excluded.delivery_status,
      provider_message_id = excluded.provider_message_id,
      provider_response = excluded.provider_response,
      accepted_recipients = excluded.accepted_recipients,
      rejected_recipients = excluded.rejected_recipients,
      last_attempt_at = excluded.last_attempt_at,
      attempt_count = public.email_log.attempt_count + 1;
$function$;

revoke all on function public.record_email_delivery_attempt(
  uuid, text, text, text, text, text, text[], text[], text, text
) from public, anon, authenticated;
grant execute on function public.record_email_delivery_attempt(
  uuid, text, text, text, text, text, text[], text[], text, text
) to service_role;

drop function if exists public.verify_attendance_scan(uuid, text, text);

create function public.verify_attendance_scan(
  p_student_id uuid,
  p_token text,
  p_scanned_by text
)
returns table (
  status text,
  student_name text,
  student_email text,
  student_college text,
  student_program text,
  student_year text,
  student_section text,
  scanned_at timestamptz,
  original_time text,
  scanned_by_name text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_scanned_at timestamptz;
  v_original_scanned_at timestamptz;
  v_original_scanned_by text;
  v_student_name text;
  v_student_email text;
  v_student_college text;
  v_student_program text;
  v_student_year text;
  v_student_section text;
  v_scanner_name text;
begin
  if p_scanned_by is null or (
    p_scanned_by <> 'admin-id'
    and not exists (
      select 1
      from public.committee_users
      where id = p_scanned_by
        and active = true
    )
  ) then
    status := 'FAKE';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.qr_tokens
    where student_id = p_student_id
      and token = p_token
  ) then
    status := 'FAKE';
    return next;
    return;
  end if;

  select a.scanned_at, a.scanned_by
  into v_original_scanned_at, v_original_scanned_by
  from public.attendance as a
  where a.student_id = p_student_id
  for update;

  if not found then
    status := 'FAKE';
    return next;
    return;
  end if;

  select s.full_name, s.email, s.college, s.program, s.year, s.section
  into v_student_name, v_student_email, v_student_college, v_student_program, v_student_year, v_student_section
  from public.students as s
  where s.id = p_student_id;

  if not found then
    status := 'FAKE';
    return next;
    return;
  end if;

  if v_original_scanned_at is not null then
    select cu.committee_name
    into v_scanner_name
    from public.committee_users as cu
    where cu.id = v_original_scanned_by;

    if v_scanner_name is null then
      if v_original_scanned_by = 'admin-id' then
        v_scanner_name := 'Admin Desk';
      else
        v_scanner_name := 'Unknown Station';
      end if;
    end if;

    status := 'ALREADY_USED';
    student_name := v_student_name;
    student_email := v_student_email;
    student_college := v_student_college;
    student_program := v_student_program;
    student_year := v_student_year;
    student_section := v_student_section;
    scanned_at := v_original_scanned_at;
    original_time := pg_catalog.to_char(
      v_original_scanned_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );
    scanned_by_name := v_scanner_name;
    return next;
    return;
  end if;

  v_scanned_at := now();

  update public.attendance
  set scanned_at = v_scanned_at,
      scanned_by = p_scanned_by
  where student_id = p_student_id;

  select cu.committee_name
  into v_scanner_name
  from public.committee_users as cu
  where cu.id = p_scanned_by;

  if v_scanner_name is null then
    v_scanner_name := 'Admin Desk';
  end if;

  status := 'VALID';
  student_name := v_student_name;
  student_email := v_student_email;
  student_college := v_student_college;
  student_program := v_student_program;
  student_year := v_student_year;
  student_section := v_student_section;
  scanned_at := v_scanned_at;
  original_time := '';
  scanned_by_name := v_scanner_name;
  return next;
end;
$function$;

comment on function public.verify_attendance_scan(uuid, text, text) is
  'Validates a stored QR token and atomically records attendance. Callable only by service-role application handlers after committee-session authentication.';

revoke all on function public.verify_attendance_scan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_attendance_scan(uuid, text, text) to service_role;

commit;
