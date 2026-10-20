begin;

-- Additive migration. Existing QR tokens and first-check-in audit fields stay intact.
alter table public.attendance
  add column am_scanned_at timestamptz,
  add column am_scanned_by text,
  add column pm_scanned_at timestamptz,
  add column pm_scanned_by text;

-- Classify historical attendance by the timestamp actually recorded.
update public.attendance set
  am_scanned_at = case when (scanned_at at time zone 'Asia/Manila')::time < time '12:00' then scanned_at end,
  am_scanned_by = case when (scanned_at at time zone 'Asia/Manila')::time < time '12:00' then scanned_by end,
  pm_scanned_at = case when (scanned_at at time zone 'Asia/Manila')::time >= time '12:00' then scanned_at end,
  pm_scanned_by = case when (scanned_at at time zone 'Asia/Manila')::time >= time '12:00' then scanned_by end
where scanned_at is not null;

comment on column public.attendance.am_scanned_at is 'First AM check-in, before 12:00 noon Asia/Manila, once per event.';
comment on column public.attendance.pm_scanned_at is 'First PM check-in, from 12:00 noon Asia/Manila, once per event.';

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
  scanned_by_name text,
  attendance_session text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_is_am boolean;
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

  -- Lock the single attendee row so simultaneous scans cannot both succeed.
  perform 1 from public.attendance a where a.student_id = p_student_id for update;
  if not found then
    status := 'FAKE'; return next; return;
  end if;
  v_scanned_at := clock_timestamp();
  v_is_am := (v_scanned_at at time zone 'Asia/Manila')::time < time '12:00';
  attendance_session := case when v_is_am then 'AM' else 'PM' end;

  select case when v_is_am then a.am_scanned_at else a.pm_scanned_at end,
         case when v_is_am then a.am_scanned_by else a.pm_scanned_by end
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

  update public.attendance
  set am_scanned_at = case when v_is_am then v_scanned_at else am_scanned_at end,
      am_scanned_by = case when v_is_am then p_scanned_by else am_scanned_by end,
      pm_scanned_at = case when not v_is_am then v_scanned_at else pm_scanned_at end,
      pm_scanned_by = case when not v_is_am then p_scanned_by else pm_scanned_by end,
      scanned_by = case when attendance.scanned_at is null then p_scanned_by else scanned_by end,
      scanned_at = coalesce(attendance.scanned_at, v_scanned_at)
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
  'Validates the existing stored QR and atomically records one attendance per AM/PM session, using a noon Asia/Manila cutoff. Callable only by service-role application handlers after committee-session authentication.';

revoke all on function public.verify_attendance_scan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_attendance_scan(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
