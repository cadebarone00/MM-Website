-- supabase/shared_round_scorekeeper.sql
-- Play a round: one scorekeeper, join code, guests (project_specs.md, owner request 2026-11-21).
--   - The host is the scorekeeper: only the host writes strokes (players who joined watch the live card).
--   - Guests (no app): the host adds them by name. They live in the round's setup (setup.guests = [{id, name, handicap}])
--     and their strokes in shared_round_guest_holes. Guests are never saved to any profile.
--   - setup.playerStats = true lets each joined player write their own putts / fairway / green (nothing else).
--   - Up to 5 in a round, guests included.
-- When the host submits, the server saves every joined player's round from these rows (app/api/rounds/personal).
--
-- Prerequisites: shared_rounds.sql (and join_codes.sql for codes). Safe to run more than once.
-- Undo: drop table public.shared_round_guest_holes;
--       alter table public.shared_round_holes drop column putts, drop column fairway, drop column green;
--       drop function public.set_shared_round_guest_strokes(uuid, uuid, text, integer, integer);
--       drop function public.set_shared_round_stats(uuid, uuid, integer, integer, text, text);
--       drop function public.shared_round_guests_ok(jsonb, integer); drop function public.shared_round_guests_ready();
--       then re-run shared_rounds.sql (restores the other functions).

begin;

alter table public.shared_round_holes add column if not exists putts integer check (putts between 0 and 10);
alter table public.shared_round_holes add column if not exists fairway text check (fairway in ('up', 'left', 'center', 'right', 'down'));
alter table public.shared_round_holes add column if not exists green text check (green in ('up', 'left', 'center', 'right', 'down'));

create table if not exists public.shared_round_guest_holes (
  round_id uuid not null references public.shared_rounds(id) on delete cascade,
  guest_id text not null check (guest_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  hole integer not null check (hole between 1 and 18),
  strokes integer check (strokes between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (round_id, guest_id, hole)
);
alter table public.shared_round_guest_holes enable row level security;
revoke all on public.shared_round_guest_holes from anon, authenticated;

-- So the server can tell this file has been run before it starts a round with guests or player stats.
create or replace function public.shared_round_guests_ready()
returns boolean language sql immutable as $$ select true $$;

-- The setup's guests are well formed and fit with p_accounts players (5 in a round).
create or replace function public.shared_round_guests_ok(p_setup jsonb, p_accounts integer)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_setup->'guests' is null or jsonb_typeof(p_setup->'guests') = 'null' then p_accounts <= 5
    when jsonb_typeof(p_setup->'guests') <> 'array' then false
    else p_accounts + jsonb_array_length(p_setup->'guests') <= 5
      and not exists (select 1 from jsonb_array_elements(p_setup->'guests') g
        where jsonb_typeof(g) <> 'object' or coalesce(g->>'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
          or length(trim(coalesce(g->>'name', ''))) not between 1 and 40)
      and (select count(distinct g->>'id') from jsonb_array_elements(p_setup->'guests') g) = jsonb_array_length(p_setup->'guests')
  end;
$$;

-- Players still in the round (invited or joined) plus its guests.
create or replace function public.shared_round_active_count(p_round uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (select count(*)::integer from shared_round_players where round_id = p_round and status in ('invited', 'joined'))
    + coalesce((select case when jsonb_typeof(setup->'guests') = 'array' then jsonb_array_length(setup->'guests') else 0 end from shared_rounds where id = p_round), 0);
$$;

-- Host creates the round with up to 4 invites; guests in the setup count toward the 5.
create or replace function public.create_shared_round(p_host uuid, p_setup jsonb, p_invites uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_round uuid;
  v_invite uuid;
  v_position integer := 1;
begin
  if jsonb_typeof(p_setup) <> 'object' then raise exception 'Round setup is missing.' using errcode = '22023'; end if;
  if coalesce(array_length(p_invites, 1), 0) > 4 then raise exception 'Up to 4 invites.' using errcode = '22023'; end if;
  if not shared_round_guests_ok(p_setup, 1 + coalesce(array_length(p_invites, 1), 0)) then raise exception 'A round has up to 5 players, guests included.' using errcode = '22023'; end if;
  if p_host = any(p_invites) then raise exception 'You can''t invite yourself.' using errcode = '22023'; end if;
  insert into shared_rounds (host, setup) values (p_host, p_setup) returning id into v_round;
  insert into shared_round_players (round_id, profile_id, position, status, answered_at) values (v_round, p_host, 0, 'joined', now());
  foreach v_invite in array coalesce(p_invites, '{}') loop
    if not exists (select 1 from profiles where id = v_invite) then raise exception 'No account found.' using errcode = '22023'; end if;
    insert into shared_round_players (round_id, profile_id, position) values (v_round, v_invite, v_position) on conflict do nothing;
    v_position := v_position + 1;
  end loop;
  return v_round;
end $$;

-- Host changes the setup (game, guests, player stats) or ends the round. Guests must still fit in 5.
create or replace function public.update_shared_round(p_host uuid, p_round uuid, p_setup jsonb, p_end boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not shared_round_is_host(p_host, p_round) then raise exception 'Only the host can change the round.' using errcode = '42501'; end if;
  if p_setup is not null and not shared_round_guests_ok(p_setup,
    (select count(*)::integer from shared_round_players where round_id = p_round and status in ('invited', 'joined'))) then
    raise exception 'A round has up to 5 players, guests included.' using errcode = '22023';
  end if;
  update shared_rounds set setup = coalesce(p_setup, setup),
    status = case when p_end then 'ended' else status end, ended_at = case when p_end then now() else ended_at end
  where id = p_round;
end $$;

-- One player's strokes on one hole (null clears it). Only the host (the scorekeeper) writes strokes.
create or replace function public.set_shared_round_strokes(p_profile uuid, p_round uuid, p_player uuid, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shared_rounds where id = p_round and status = 'live') then raise exception 'This round has ended.' using errcode = '22023'; end if;
  if not shared_round_is_host(p_profile, p_round) then raise exception 'Only the host keeps score in this round.' using errcode = '42501'; end if;
  if not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_player and status in ('invited', 'joined')) then
    raise exception 'That player isn''t in this round.' using errcode = '22023';
  end if;
  insert into shared_round_holes (round_id, profile_id, hole, strokes, entered_by) values (p_round, p_player, p_hole, p_strokes, p_profile)
  on conflict (round_id, profile_id, hole) do update set strokes = excluded.strokes, entered_by = excluded.entered_by, updated_at = now();
end $$;

-- A guest's strokes on one hole (host only).
create or replace function public.set_shared_round_guest_strokes(p_profile uuid, p_round uuid, p_guest text, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shared_rounds where id = p_round and status = 'live') then raise exception 'This round has ended.' using errcode = '22023'; end if;
  if not shared_round_is_host(p_profile, p_round) then raise exception 'Only the host keeps score in this round.' using errcode = '42501'; end if;
  if not exists (select 1 from shared_rounds r, jsonb_array_elements(case when jsonb_typeof(r.setup->'guests') = 'array' then r.setup->'guests' else '[]'::jsonb end) g
    where r.id = p_round and g->>'id' = p_guest) then
    raise exception 'That guest isn''t in this round.' using errcode = '22023';
  end if;
  insert into shared_round_guest_holes (round_id, guest_id, hole, strokes) values (p_round, p_guest, p_hole, p_strokes)
  on conflict (round_id, guest_id, hole) do update set strokes = excluded.strokes, updated_at = now();
end $$;

-- My own putts / fairway / green on one hole: a joined player when the host turned player stats on (the host always may).
create or replace function public.set_shared_round_stats(p_profile uuid, p_round uuid, p_hole integer, p_putts integer, p_fairway text, p_green text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shared_rounds where id = p_round and status = 'live') then raise exception 'This round has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status = 'joined') then
    raise exception 'You''re not in this round.' using errcode = '42501';
  end if;
  if not shared_round_is_host(p_profile, p_round) and not exists (select 1 from shared_rounds where id = p_round and setup->>'playerStats' = 'true') then
    raise exception 'The host hasn''t turned on player stats.' using errcode = '42501';
  end if;
  insert into shared_round_holes (round_id, profile_id, hole, putts, fairway, green) values (p_round, p_profile, p_hole, p_putts, p_fairway, p_green)
  on conflict (round_id, profile_id, hole) do update set putts = excluded.putts, fairway = excluded.fairway, green = excluded.green, updated_at = now();
end $$;

-- The whole round for the host or a joined player: setup, players, strokes + stats, guests' strokes, picks.
create or replace function public.get_shared_round(p_profile uuid, p_round uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status = 'joined') then null else
    jsonb_build_object(
      'id', r.id, 'host', r.host, 'status', r.status, 'setup', r.setup, 'startedAt', r.started_at,
      'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'position', p.position, 'status', p.status) order by p.position), '[]'::jsonb)
                  from shared_round_players p join profiles pr on pr.id = p.profile_id where p.round_id = r.id),
      'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'hole', h.hole, 'strokes', h.strokes,
                  'putts', h.putts, 'fairway', h.fairway, 'green', h.green)), '[]'::jsonb)
                from shared_round_holes h where h.round_id = r.id),
      'guestHoles', (select coalesce(jsonb_agg(jsonb_build_object('guestId', g.guest_id, 'hole', g.hole, 'strokes', g.strokes)), '[]'::jsonb)
                from shared_round_guest_holes g where g.round_id = r.id),
      'picks', (select coalesce(jsonb_agg(jsonb_build_object('hole', k.hole, 'pick', k.pick)), '[]'::jsonb)
                from shared_round_picks k where k.round_id = r.id))
  end
  from shared_rounds r where r.id = p_round;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'shared_round_guests_ready()', 'shared_round_guests_ok(jsonb, integer)', 'shared_round_active_count(uuid)',
    'create_shared_round(uuid, jsonb, uuid[])', 'update_shared_round(uuid, uuid, jsonb, boolean)',
    'set_shared_round_strokes(uuid, uuid, uuid, integer, integer)', 'set_shared_round_guest_strokes(uuid, uuid, text, integer, integer)',
    'set_shared_round_stats(uuid, uuid, integer, integer, text, text)', 'get_shared_round(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
