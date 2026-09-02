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
  v_student_section text;
  v_scanner_name text;
begin
  -- The application authenticates the custom committee session before calling
  -- this service-role-only RPC. Keep database-side checks as defense in depth.
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

  select s.full_name, s.email, s.college, s.program, s.section
  into v_student_name, v_student_email, v_student_college, v_student_program, v_student_section
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
