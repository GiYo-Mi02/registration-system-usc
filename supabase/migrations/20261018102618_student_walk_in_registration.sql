begin;

alter table public.events add column walk_in_open boolean not null default false;
alter table public.students add column walk_in_request_hash text;
create unique index students_walk_in_request_hash_key
  on public.students(walk_in_request_hash) where walk_in_request_hash is not null;

alter table public.email_log drop constraint email_log_delivery_status_check;
alter table public.email_log add constraint email_log_delivery_status_check check (
  delivery_status in ('queued', 'smtp_accepted', 'failed', 'simulated', 'legacy_sent', 'not_requested')
);

create table public.walk_in_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create index walk_in_rate_limits_window on public.walk_in_rate_limits(window_start);
alter table public.walk_in_rate_limits enable row level security;
revoke all on public.walk_in_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.walk_in_rate_limits to service_role;

create function public.consume_walk_in_attempt(p_bucket_hash text, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $function$
declare
  v_window timestamptz := pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp());
  v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'Invalid registration request limit';
  end if;
  -- Bounded opportunistic expiry; no IP addresses or receipts are stored here.
  delete from public.walk_in_rate_limits where bucket_hash in (
    select r.bucket_hash from public.walk_in_rate_limits r
    where r.window_start < v_window - interval '2 minutes'
    order by r.window_start limit 100
  );
  insert into public.walk_in_rate_limits as r(bucket_hash, window_start, attempts)
  values (p_bucket_hash, v_window, 1)
  on conflict (bucket_hash) do update set
    window_start = v_window,
    attempts = case when r.window_start = v_window then least(r.attempts + 1, p_limit + 1) else 1 end
  returning attempts into v_count;
  return v_count <= p_limit;
end;
$function$;

create function public.get_walk_in_ticket(p_event_id uuid, p_request_hash text)
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select pg_catalog.jsonb_build_object(
    'full_name', s.full_name,
    'qr_data_url', l.qr_data_url,
    'scanned_at', a.scanned_at,
    'event', pg_catalog.jsonb_build_object(
      'id', e.id, 'name', e.name, 'event_date', e.event_date,
      'venue', e.venue, 'description', e.description, 'banner_url', e.banner_url
    )
  ) from public.students s
  join public.events e on e.id = s.event_id
  join public.email_log l on l.student_id = s.id
  join public.attendance a on a.student_id = s.id
  where s.event_id = p_event_id and s.walk_in_request_hash = p_request_hash;
$function$;

create function public.register_walk_in(
  p_event_id uuid, p_student_id uuid, p_request_hash text, p_details jsonb,
  p_token text, p_qr_data_url text, p_email_html text
)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_open boolean;
  v_ticket jsonb;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_details->>'email'));
begin
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_token is null or p_qr_data_url is null or p_email_html is null then
    raise exception 'Invalid registration transaction';
  end if;
  -- Serialize only retries of this receipt, not all students at the event.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_hash, 0));
  v_ticket := public.get_walk_in_ticket(p_event_id, p_request_hash);
  if v_ticket is not null then
    return pg_catalog.jsonb_build_object('status', 'READY', 'ticket', v_ticket);
  end if;
  -- An admin closing the event waits for registrations already accepted by this lock.
  select e.walk_in_open into v_open from public.events e where e.id = p_event_id for share;
  if not found or not v_open then
    return pg_catalog.jsonb_build_object('status', 'CLOSED');
  end if;
  if exists(select 1 from public.students s where s.event_id = p_event_id and pg_catalog.lower(s.email) = v_email) then
    return pg_catalog.jsonb_build_object('status', 'DUPLICATE');
  end if;
  insert into public.students(
    id, event_id, full_name, email, college, program, year, section,
    form_response_id, email_status, email_error, walk_in_request_hash
  ) values (
    p_student_id, p_event_id, p_details->>'full_name', v_email, p_details->>'college',
    p_details->>'program', p_details->>'year', p_details->>'section',
    'walk_in_' || p_student_id::text, 'failed', 'Email not requested', p_request_hash
  );
  insert into public.qr_tokens(student_id, event_id, token) values (p_student_id, p_event_id, p_token);
  insert into public.attendance(student_id, event_id, scanned_at, scanned_by) values (p_student_id, p_event_id, null, null);
  insert into public.email_log(student_id, status, error_message, email_html, qr_data_url, delivery_status)
    values (p_student_id, 'failed', 'Email not requested', p_email_html, p_qr_data_url, 'not_requested');
  return pg_catalog.jsonb_build_object('status', 'READY', 'ticket', public.get_walk_in_ticket(p_event_id, p_request_hash));
exception when unique_violation then
  -- The exception rolls back every write above, including concurrent email conflicts.
  return pg_catalog.jsonb_build_object('status', 'DUPLICATE');
end;
$function$;

revoke all on function public.consume_walk_in_attempt(text, integer) from public, anon, authenticated;
revoke all on function public.get_walk_in_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.register_walk_in(uuid, uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_walk_in_attempt(text, integer) to service_role;
grant execute on function public.get_walk_in_ticket(uuid, text) to service_role;
grant execute on function public.register_walk_in(uuid, uuid, text, jsonb, text, text, text) to service_role;

comment on column public.students.walk_in_request_hash is 'Server-keyed receipt hash for same-tab ticket recovery. Never expose this field through public APIs.';
comment on column public.events.walk_in_open is 'Admin-controlled public walk-in registration. Closed by default.';
commit;
