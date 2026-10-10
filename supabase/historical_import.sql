-- supabase/historical_import.sql
-- Historical Trip Import (project_specs.md, "Historical Trip Import — foundation"). A standard feature for every
-- group: past years of a trip / event, imported from a versioned package (lib/history/historicalPackage.ts), with
-- the people in them kept as HISTORICAL PARTICIPANTS. A participant is a name in the history and may stay unlinked
-- forever (profile_id null) — nobody gets a fake profile, and nothing is matched by name or email. A participant is
-- linked to a modern profile only by an explicit, audited action:
--   organizer proposes → golfer accepts | golfer requests → organizer approves | platform admin links directly.
-- Linking copies nothing: the profile reads the participant's rounds through the link (list_profile_historical_rounds),
-- so unlinking or relinking can never leave a stray copy. Historical rounds never count toward handicap (V1).
--
--   historical_imports            one applied package (dataset key + checksum): the provenance of everything below
--   historical_events             the trip / event (e.g. The Maroon); organizer_profile_id answers link requests;
--                                 optional golf_trip_id once it's attached to a modern Golf Trip
--   historical_participants       the people (profile_id null until linked)
--   historical_editions           one past year: dates, place, teams (by key, for that year only), recorded results
--   historical_roster             who played that year and on which team (team is per edition, never on a profile)
--   historical_rounds             the schedule: round number, day / session, date, course snapshot, format
--   historical_scores             one participant's card for one round (holes as recorded)
--   historical_matches            matches, sides, points, result
--   historical_link_requests      pending / answered link requests
--   historical_link_events        the audit log of every link action (append-only)
--
-- Idempotent: every row carries its package key and is unique within its parent, and a dataset can be applied once
-- (same checksum again = "already imported", nothing written; different content = refused). Nothing here runs by
-- itself: import_historical_package(actor, package, dry_run => true) is the dry run (it rolls back and reports).
--
-- All functions are service-role only; the server passes the signed-in profile from the session.
-- Prerequisites: schema.sql (profiles), platform_foundation.sql (platform_role), golf_trips.sql. Safe to run more than once.
-- Undo (drops all imported history): drop the functions below, then
--   drop table if exists public.historical_link_events, public.historical_link_requests, public.historical_matches,
--     public.historical_scores, public.historical_rounds, public.historical_roster, public.historical_editions,
--     public.historical_participants, public.historical_events, public.historical_imports;

begin;

create table if not exists public.historical_imports (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null unique check (dataset_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  format text not null,
  version integer not null check (version >= 1),
  checksum text not null,
  dataset jsonb not null,
  summary jsonb not null,
  flags jsonb not null default '[]'::jsonb,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now()
);

create table if not exists public.historical_events (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  organizer_profile_id uuid references public.profiles(id) on delete set null,
  golf_trip_id uuid references public.golf_trips(id) on delete set null,
  import_id uuid not null references public.historical_imports(id),
  created_at timestamptz not null default now()
);

create table if not exists public.historical_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.historical_events(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  -- NULL = not linked (valid forever). Set only by the link functions below.
  profile_id uuid references public.profiles(id) on delete set null,
  linked_at timestamptz,
  import_id uuid not null references public.historical_imports(id),
  unique (event_id, source_key),
  check ((profile_id is null) = (linked_at is null))
);
-- One profile is at most one participant of an event.
create unique index if not exists historical_participants_profile_idx on public.historical_participants (event_id, profile_id) where profile_id is not null;
create index if not exists historical_participants_linked_idx on public.historical_participants (profile_id) where profile_id is not null;

create table if not exists public.historical_editions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.historical_events(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  year integer not null check (year between 1900 and 2200),
  label text not null check (length(trim(label)) between 1 and 120),
  start_date date,
  end_date date,
  place text check (length(place) <= 200),
  -- [{ key, name, color }] for this edition only.
  teams jsonb not null default '[]'::jsonb check (jsonb_typeof(teams) = 'array'),
  -- As recorded: { teams: [{ team, points }], pointsAvailable, winnerTeam, individualChampion (participant key) }.
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  import_id uuid not null references public.historical_imports(id),
  unique (event_id, source_key),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create table if not exists public.historical_roster (
  edition_id uuid not null references public.historical_editions(id) on delete cascade,
  participant_id uuid not null references public.historical_participants(id) on delete cascade,
  team_key text,
  captain boolean,
  primary key (edition_id, participant_id)
);

create table if not exists public.historical_rounds (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.historical_editions(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  number integer not null check (number between 0 and 62),
  day integer check (day between 1 and 31),
  session text check (length(session) <= 40),
  date date,
  -- Snapshot: { key, name, place, ref, par } (ref = the course API id when known).
  course jsonb check (course is null or jsonb_typeof(course) = 'object'),
  format text not null check (length(trim(format)) between 1 and 60),
  scoring text not null check (scoring in ('individual', 'team')),
  unique (edition_id, source_key)
);

create table if not exists public.historical_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.historical_rounds(id) on delete cascade,
  participant_id uuid not null references public.historical_participants(id) on delete cascade,
  holes_played integer not null check (holes_played in (9, 18)),
  total integer check (total between 18 and 200),
  -- [{ number, par, strokes, putts, fairway ('hit' | 'missed' | null), green (true | false | null) }] as recorded.
  holes jsonb not null default '[]'::jsonb check (jsonb_typeof(holes) = 'array' and jsonb_array_length(holes) <= holes_played),
  unique (round_id, participant_id)
);

create table if not exists public.historical_matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.historical_rounds(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  format text not null check (length(trim(format)) between 1 and 60),
  -- [{ team, participants: [participant key] }, { ... }], points [a, b], winner 0 | 1 | 'halved' | null.
  sides jsonb not null check (jsonb_typeof(sides) = 'array' and jsonb_array_length(sides) = 2),
  points jsonb not null check (jsonb_typeof(points) = 'array'),
  result text check (length(result) <= 40),
  winner text check (winner in ('0', '1', 'halved')),
  unique (round_id, source_key)
);

create table if not exists public.historical_link_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.historical_participants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('organizer_proposed', 'golfer_requested')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'superseded')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);
-- At most one open request per participant.
create unique index if not exists historical_link_requests_open_idx on public.historical_link_requests (participant_id) where status = 'pending';

create table if not exists public.historical_link_events (
  id bigint generated always as identity primary key,
  participant_id uuid not null references public.historical_participants(id) on delete cascade,
  request_id uuid references public.historical_link_requests(id) on delete set null,
  action text not null check (action in ('proposed', 'requested', 'accepted', 'approved', 'declined', 'admin_linked', 'unlinked', 'superseded')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);

-- The audit log is append-only (rows only go when their participant does, i.e. when a whole import is dropped).
create or replace function public.historical_link_events_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Link history can''t be changed.' using errcode = '42501';
end;
$$;
drop trigger if exists historical_link_events_append_only on public.historical_link_events;
create trigger historical_link_events_append_only before update on public.historical_link_events
  for each row execute function public.historical_link_events_append_only();

do $$ declare t text; begin
  foreach t in array array['historical_imports', 'historical_events', 'historical_participants', 'historical_editions', 'historical_roster',
    'historical_rounds', 'historical_scores', 'historical_matches', 'historical_link_requests', 'historical_link_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public.is_platform_admin(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile and platform_role = 'admin');
$$;

-- --- Import -------------------------------------------------------------------------------------------------------
-- Applies a package (lib/history/historicalPackage.ts, already checked by validateHistoricalPackage). Platform admins
-- only in V1. Returns { status: 'imported' | 'dry-run' | 'already-imported', counts, checksum }. A dry run does the
-- whole import inside a rolled-back block, so the counts are real and nothing is kept.
create or replace function public.import_historical_package(p_actor uuid, p_package jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_checksum text := encode(sha256(convert_to(p_package::text, 'UTF8')), 'hex');
  v_dataset text := p_package->'dataset'->>'key';
  v_existing public.historical_imports;
  v_import uuid;
  v_event uuid;
  v_counts jsonb;
  e jsonb; r jsonb; s jsonb; m jsonb;
  v_edition uuid; v_round uuid;
begin
  if not is_platform_admin(p_actor) then raise exception 'Only a platform admin can import history.' using errcode = '42501'; end if;
  if p_package->>'format' is distinct from 'historical-trip-package' or (p_package->>'version')::int is distinct from 1 then
    raise exception 'This isn''t a version 1 historical trip package.' using errcode = '22023';
  end if;
  if p_package::text ~* '"(email|profileid|profile_id|userid|user_id|authid)"\s*:' then
    raise exception 'Packages never carry emails or account ids — people are linked to profiles afterwards.' using errcode = '22023';
  end if;
  select * into v_existing from historical_imports where dataset_key = v_dataset;
  if found then
    if v_existing.checksum = v_checksum then
      return jsonb_build_object('status', 'already-imported', 'checksum', v_checksum, 'counts', v_existing.summary);
    end if;
    raise exception 'Dataset % was already imported with different content. Corrections are a separate step.', v_dataset using errcode = '22023';
  end if;

  begin
    insert into historical_imports (dataset_key, format, version, checksum, dataset, summary, flags, imported_by)
    values (v_dataset, p_package->>'format', 1, v_checksum, p_package->'dataset', '{}'::jsonb, coalesce(p_package->'flags', '[]'::jsonb), p_actor)
    returning id into v_import;

    insert into historical_events (source_key, name, organizer_profile_id, import_id)
    values (p_package->'event'->>'key', trim(p_package->'event'->>'name'), p_actor, v_import)
    on conflict (source_key) do nothing;
    select id into v_event from historical_events where source_key = p_package->'event'->>'key';

    insert into historical_participants (event_id, source_key, display_name, import_id)
    select v_event, x->>'key', trim(x->>'name'), v_import from jsonb_array_elements(p_package->'participants') x
    on conflict (event_id, source_key) do nothing;

    for e in select * from jsonb_array_elements(p_package->'editions') loop
      insert into historical_editions (event_id, source_key, year, label, start_date, end_date, place, teams, results, import_id)
      values (v_event, e->>'key', (e->>'year')::int, trim(e->>'label'), (e->>'startDate')::date, (e->>'endDate')::date, e->>'place',
        coalesce(e->'teams', '[]'::jsonb), coalesce(e->'results', '{}'::jsonb), v_import)
      on conflict (event_id, source_key) do nothing;
      select id into v_edition from historical_editions where event_id = v_event and source_key = e->>'key';

      insert into historical_roster (edition_id, participant_id, team_key, captain)
      select v_edition, p.id, x->>'team', (x->>'captain')::boolean
      from jsonb_array_elements(e->'roster') x join historical_participants p on p.event_id = v_event and p.source_key = x->>'participant'
      on conflict do nothing;

      for r in select * from jsonb_array_elements(e->'rounds') loop
        insert into historical_rounds (edition_id, source_key, number, day, session, date, course, format, scoring)
        values (v_edition, r->>'key', (r->>'number')::int, (r->>'day')::int, r->>'session', (r->>'date')::date,
          (select c from jsonb_array_elements(p_package->'courses') c where c->>'key' = r->>'course'), trim(r->>'format'), r->>'scoring')
        on conflict (edition_id, source_key) do nothing;
        select id into v_round from historical_rounds where edition_id = v_edition and source_key = r->>'key';

        insert into historical_scores (round_id, participant_id, holes_played, total, holes)
        select v_round, p.id, (x->>'holesPlayed')::int, (x->>'total')::int, coalesce(x->'holes', '[]'::jsonb)
        from jsonb_array_elements(coalesce(r->'scores', '[]'::jsonb)) x join historical_participants p on p.event_id = v_event and p.source_key = x->>'participant'
        on conflict (round_id, participant_id) do nothing;
      end loop;

      for m in select * from jsonb_array_elements(coalesce(e->'matches', '[]'::jsonb)) loop
        insert into historical_matches (round_id, source_key, format, sides, points, result, winner)
        select hr.id, m->>'key', trim(m->>'format'), m->'sides', m->'points', m->>'result', m->>'winner'
        from historical_rounds hr where hr.edition_id = v_edition and hr.source_key = m->>'round'
        on conflict (round_id, source_key) do nothing;
      end loop;
    end loop;

    select jsonb_build_object(
      'participants', (select count(*) from historical_participants where import_id = v_import),
      'editions', (select count(*) from historical_editions where import_id = v_import),
      'roster', (select count(*) from historical_roster ro join historical_editions he on he.id = ro.edition_id where he.import_id = v_import),
      'rounds', (select count(*) from historical_rounds hr join historical_editions he on he.id = hr.edition_id where he.import_id = v_import),
      'scores', (select count(*) from historical_scores sc join historical_rounds hr on hr.id = sc.round_id join historical_editions he on he.id = hr.edition_id where he.import_id = v_import),
      'matches', (select count(*) from historical_matches hm join historical_rounds hr on hr.id = hm.round_id join historical_editions he on he.id = hr.edition_id where he.import_id = v_import)
    ) into v_counts;
    update historical_imports set summary = v_counts where id = v_import;

    if p_dry_run then raise exception 'historical-dry-run' using errcode = 'P0001'; end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'historical-dry-run' then raise; end if;
    return jsonb_build_object('status', 'dry-run', 'checksum', v_checksum, 'counts', v_counts);
  end;
  return jsonb_build_object('status', 'imported', 'checksum', v_checksum, 'counts', v_counts);
end;
$$;

-- --- Linking a participant to a profile (explicit, audited) -------------------------------------------------------

create or replace function public.historical_link_check(p_participant uuid, p_profile uuid)
returns public.historical_participants
language plpgsql stable security definer set search_path = public as $$
declare v public.historical_participants;
begin
  select * into v from historical_participants where id = p_participant;
  if not found then raise exception 'No such participant.' using errcode = '22023'; end if;
  if v.profile_id is not null then raise exception 'This participant is already linked.' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'No such profile.' using errcode = '22023'; end if;
  if exists (select 1 from historical_participants where event_id = v.event_id and profile_id = p_profile) then
    raise exception 'That profile is already linked to someone in this history.' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.can_manage_historical_event(p_actor uuid, p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin(p_actor) or exists (select 1 from historical_events where id = p_event and organizer_profile_id = p_actor);
$$;

-- Organizer proposes: "this participant is <profile>" — that golfer then accepts or declines.
create or replace function public.propose_historical_link(p_actor uuid, p_participant uuid, p_profile uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.historical_participants; v_request uuid;
begin
  v := historical_link_check(p_participant, p_profile);
  if not can_manage_historical_event(p_actor, v.event_id) then raise exception 'Only the organizer can propose a link.' using errcode = '42501'; end if;
  insert into historical_link_requests (participant_id, profile_id, kind, created_by) values (p_participant, p_profile, 'organizer_proposed', p_actor) returning id into v_request;
  insert into historical_link_events (participant_id, request_id, action, actor_profile_id, profile_id) values (p_participant, v_request, 'proposed', p_actor, p_profile);
  return v_request;
exception when unique_violation then raise exception 'There''s already an open request for this participant.' using errcode = '22023';
end;
$$;

-- Golfer requests: "that's me" — the organizer then approves or declines.
create or replace function public.request_historical_link(p_actor uuid, p_participant uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.historical_participants; v_request uuid;
begin
  v := historical_link_check(p_participant, p_actor);
  insert into historical_link_requests (participant_id, profile_id, kind, created_by) values (p_participant, p_actor, 'golfer_requested', p_actor) returning id into v_request;
  insert into historical_link_events (participant_id, request_id, action, actor_profile_id, profile_id) values (p_participant, v_request, 'requested', p_actor, p_actor);
  return v_request;
exception when unique_violation then raise exception 'There''s already an open request for this participant.' using errcode = '22023';
end;
$$;

-- Answer a request: a proposal is answered by the golfer it names; a golfer's request by the organizer (or an admin).
create or replace function public.answer_historical_link(p_actor uuid, p_request uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare q public.historical_link_requests; v public.historical_participants;
begin
  select * into q from historical_link_requests where id = p_request for update;
  if not found or q.status <> 'pending' then raise exception 'That request isn''t open.' using errcode = '22023'; end if;
  select * into v from historical_participants where id = q.participant_id for update;
  if q.kind = 'organizer_proposed' and p_actor <> q.profile_id then raise exception 'Only the golfer named can answer this.' using errcode = '42501'; end if;
  if q.kind = 'golfer_requested' and not can_manage_historical_event(p_actor, v.event_id) then raise exception 'Only the organizer can approve this.' using errcode = '42501'; end if;
  if p_accept then
    perform historical_link_check(v.id, q.profile_id);
    update historical_participants set profile_id = q.profile_id, linked_at = now() where id = v.id;
  end if;
  update historical_link_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_by = p_actor, decided_at = now() where id = q.id;
  insert into historical_link_events (participant_id, request_id, action, actor_profile_id, profile_id)
  values (v.id, q.id, case when not p_accept then 'declined' when q.kind = 'organizer_proposed' then 'accepted' else 'approved' end, p_actor, q.profile_id);
  return case when p_accept then 'linked' else 'declined' end;
end;
$$;

-- Platform admin links directly (e.g. support fixing a history), with a note. Any open request is superseded.
create or replace function public.admin_link_historical_participant(p_actor uuid, p_participant uuid, p_profile uuid, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare v public.historical_participants; q uuid;
begin
  if not is_platform_admin(p_actor) then raise exception 'Only a platform admin can link directly.' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Say why (the note is kept in the link history).' using errcode = '22023'; end if;
  v := historical_link_check(p_participant, p_profile);
  for q in update historical_link_requests set status = 'superseded', decided_by = p_actor, decided_at = now() where participant_id = v.id and status = 'pending' returning id loop
    insert into historical_link_events (participant_id, request_id, action, actor_profile_id) values (v.id, q, 'superseded', p_actor);
  end loop;
  update historical_participants set profile_id = p_profile, linked_at = now() where id = v.id;
  insert into historical_link_events (participant_id, action, actor_profile_id, profile_id, note) values (v.id, 'admin_linked', p_actor, p_profile, trim(p_note));
  return 'linked';
end;
$$;

-- Platform admin undoes a wrong link. The participant and every round stay; only the link goes.
create or replace function public.unlink_historical_participant(p_actor uuid, p_participant uuid, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare v public.historical_participants;
begin
  if not is_platform_admin(p_actor) then raise exception 'Only a platform admin can unlink.' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Say why (the note is kept in the link history).' using errcode = '22023'; end if;
  select * into v from historical_participants where id = p_participant for update;
  if not found or v.profile_id is null then raise exception 'This participant isn''t linked.' using errcode = '22023'; end if;
  update historical_participants set profile_id = null, linked_at = null where id = v.id;
  insert into historical_link_events (participant_id, action, actor_profile_id, profile_id, note) values (v.id, 'unlinked', p_actor, v.profile_id, trim(p_note));
  return 'unlinked';
end;
$$;

-- --- Reading ------------------------------------------------------------------------------------------------------
-- A profile's historical rounds through its links, in the same shape as player_round_json (list_profile_rounds), so
-- Profile → Rounds and Stats read them like any round. Same privacy: the owner, or anyone when the profile is Public.
-- Individual cards only (a shared Alternate Shot card has no personal score). Never toward handicap (V1).
create or replace function public.list_profile_historical_rounds(p_viewer uuid, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->>'datePlayed' desc, row->>'sourceKey'), '[]'::jsonb) from (
    select jsonb_build_object(
      'profileId', case when p_viewer = p_owner then p_owner end,
      'source', 'history', 'sourceKey', 'historical:' || sc.id,
      'sourceLabel', left(ev.name || ' ' || ed.year || ' · Round ' || hr.number, 120),
      'datePlayed', coalesce(hr.date, ed.start_date),
      'course', jsonb_build_object('ref', hr.course->>'ref', 'name', coalesce(hr.course->>'name', 'Course not recorded'), 'place', coalesce(hr.course->>'place', '')),
      'tee', null, 'holesPlayed', sc.holes_played, 'format', hr.format,
      'holes', coalesce((select jsonb_agg(jsonb_build_object('number', (h->>'number')::int, 'par', (h->>'par')::int, 'strokes', (h->>'strokes')::int,
          'putts', (h->>'putts')::int, 'fairway', case when h->>'fairway' = 'hit' then 'center' end, 'green', case when (h->>'green')::boolean then 'center' end)
          order by (h->>'number')::int) from jsonb_array_elements(sc.holes) h), '[]'::jsonb),
      'total', sc.total, 'countsForHandicap', false, 'notCountedReason', 'Historical rounds don''t count toward handicap yet',
      'differential', null, 'enteredBy', 'organizer') as row
    from historical_participants pa
    join profiles owner on owner.id = pa.profile_id
    join historical_events ev on ev.id = pa.event_id
    join historical_scores sc on sc.participant_id = pa.id
    join historical_rounds hr on hr.id = sc.round_id
    join historical_editions ed on ed.id = hr.edition_id
    where pa.profile_id = p_owner and sc.total is not null and coalesce(hr.date, ed.start_date) is not null
      and (p_viewer = p_owner or owner.rounds_visibility = 'public')
  ) rows(row);
$$;

-- Organizer / admin view of an event's participants and their link state (no emails; profile shown by username).
create or replace function public.list_historical_participants(p_actor uuid, p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_manage_historical_event(p_actor, p_event) then coalesce((
    select jsonb_agg(jsonb_build_object('id', pa.id, 'key', pa.source_key, 'name', pa.display_name, 'linkedUsername', pr.username,
        'openRequest', (select jsonb_build_object('id', q.id, 'kind', q.kind, 'username', qp.username) from historical_link_requests q
          join profiles qp on qp.id = q.profile_id where q.participant_id = pa.id and q.status = 'pending'))
      order by lower(pa.display_name))
    from historical_participants pa left join profiles pr on pr.id = pa.profile_id where pa.event_id = p_event), '[]'::jsonb) end;
$$;

do $$ declare f text; begin
  foreach f in array array['is_platform_admin(uuid)', 'import_historical_package(uuid, jsonb, boolean)', 'historical_link_check(uuid, uuid)',
    'can_manage_historical_event(uuid, uuid)', 'propose_historical_link(uuid, uuid, uuid)', 'request_historical_link(uuid, uuid)',
    'answer_historical_link(uuid, uuid, boolean)', 'admin_link_historical_participant(uuid, uuid, uuid, text)',
    'unlink_historical_participant(uuid, uuid, text)', 'list_profile_historical_rounds(uuid, uuid)', 'list_historical_participants(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public.import_historical_package(uuid, jsonb, boolean), public.propose_historical_link(uuid, uuid, uuid),
  public.request_historical_link(uuid, uuid), public.answer_historical_link(uuid, uuid, boolean),
  public.admin_link_historical_participant(uuid, uuid, uuid, text), public.unlink_historical_participant(uuid, uuid, text),
  public.list_profile_historical_rounds(uuid, uuid), public.list_historical_participants(uuid, uuid) to service_role;

commit;
