-- Separate event roster: no synthetic emails or changes to the QR attendance ledger.
alter table public.events add column if not exists roster_check_in_open boolean not null default false;

create table public.participant_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 250),
  school text not null check (length(school) between 1 and 250),
  program text not null default '', year text not null default '',
  school_id text not null default '', school_id_key text,
  cor text not null default '', coach_name text not null default '',
  check_in_code text,
  created_at timestamptz not null default now(),
  unique(event_id, school, full_name),
  unique(event_id, check_in_code),
  check (school_id_key is not null or check_in_code is not null)
);
create index participant_roster_lookup on public.participant_roster(event_id, school_id_key);
create table public.participant_check_ins (
  reference uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participant_roster(id) on delete cascade,
  checked_in_at timestamptz not null default clock_timestamp()
);
alter table public.participant_roster enable row level security;
alter table public.participant_check_ins enable row level security;
revoke all on public.participant_roster, public.participant_check_ins from public, anon, authenticated;
grant select, insert, update, delete on public.participant_roster, public.participant_check_ins to service_role;

-- One atomic import. Existing participants, committee codes and attendance are preserved.
create function public.import_participant_roster(p_event_id uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare inserted integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Invalid participant roster';
  end if;
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  insert into public.participant_roster(event_id, full_name, school, program, year, school_id, school_id_key, cor, coach_name, check_in_code)
  select p_event_id, r.full_name, r.school, r.program, r.year, r.school_id, r.school_id_key, r.cor, r.coach_name, r.check_in_code
  from jsonb_to_recordset(p_rows) as r(full_name text, school text, program text, year text, school_id text, school_id_key text, cor text, coach_name text, check_in_code text)
  on conflict(event_id, school, full_name) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Database time and uniqueness make concurrent/lost-response retries idempotent.
create function public.confirm_participant_check_in(p_event_id uuid, p_participant_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare participant public.participant_roster; event public.events; receipt public.participant_check_ins;
begin
  select * into event from public.events where id=p_event_id for share;
  select * into participant from public.participant_roster where id=p_participant_id and event_id=p_event_id for update;
  if not found then return jsonb_build_object('status','NOT_FOUND'); end if;
  select * into receipt from public.participant_check_ins where participant_id=participant.id;
  if not found then
    if not event.roster_check_in_open then return jsonb_build_object('status','CLOSED'); end if;
    insert into public.participant_check_ins(participant_id) values(participant.id) returning * into receipt;
  end if;
  return jsonb_build_object('status','READY', 'receipt', jsonb_build_object(
    'reference',receipt.reference, 'checked_in_at',receipt.checked_in_at,
    'participant',jsonb_build_object('full_name',participant.full_name,'school',participant.school,'program',participant.program,
      'year',participant.year,'school_id',participant.school_id,'cor',participant.cor,'coach_name',participant.coach_name),
    'event',jsonb_build_object('id',event.id,'name',event.name,'event_date',event.event_date,'venue',event.venue,'description',event.description,'banner_url',event.banner_url)
  ));
end $$;
revoke all on function public.import_participant_roster(uuid,jsonb), public.confirm_participant_check_in(uuid,uuid) from public, anon, authenticated;
grant execute on function public.import_participant_roster(uuid,jsonb), public.confirm_participant_check_in(uuid,uuid) to service_role;
