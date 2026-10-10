-- supabase/shared_rounds.sql
-- Play a round with friends: invite-only rounds that live on every player's phone. The host creates the round and
-- invites Maroon accounts; invited players Join or Decline from the Play page; everyone who joined enters their own
-- strokes (the host can enter anyone's) and the game's per-hole picks, and every phone reads the same round.
-- When a player finishes, they submit their own card through save_player_round (player_rounds.sql) like any round.
-- See project_specs.md, "Change: invite-only shared rounds".
--
-- setup = the round setup JSON (course, tee, holes, game; lib/platform/personalRound.ts → PersonalRoundSetup).
-- Players keep their order in the group (position; host = 0) because games like Wolf rotate in that order.
--
-- Access: nobody reads or writes the tables directly (RLS on, no policies). The server calls the functions below with
-- the signed-in user's id, using the service-role key (lib/platform/sharedRoundsServer.ts):
--   - only the host and joined players can read a round; invited players only see their invite
--   - a player writes only their own strokes; the host writes anyone's (invited or joined)
--   - only the host invites, removes, changes the setup (game) or ends the round
--
-- Prerequisite: schema.sql (profiles). Safe to run more than once.
-- Undo: drop table public.shared_round_picks, public.shared_round_holes, public.shared_round_players, public.shared_rounds cascade;

begin;

create table if not exists public.shared_rounds (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles(id) on delete cascade,
  setup jsonb not null,
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.shared_round_players (
  round_id uuid not null references public.shared_rounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null check (position between 0 and 20),
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'removed')),
  invited_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (round_id, profile_id)
);
create index if not exists shared_round_players_invites on public.shared_round_players (profile_id) where status = 'invited';

create table if not exists public.shared_round_holes (
  round_id uuid not null references public.shared_rounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  strokes integer check (strokes between 1 and 20),
  entered_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (round_id, profile_id, hole)
);

create table if not exists public.shared_round_picks (
  round_id uuid not null references public.shared_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  pick jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (round_id, hole)
);

alter table public.shared_rounds enable row level security;
alter table public.shared_round_players enable row level security;
alter table public.shared_round_holes enable row level security;
alter table public.shared_round_picks enable row level security;
revoke all on public.shared_rounds, public.shared_round_players, public.shared_round_holes, public.shared_round_picks from anon, authenticated;

-- Players still in the round (invited or joined), not counting declined / removed.
create or replace function public.shared_round_active_count(p_round uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from shared_round_players where round_id = p_round and status in ('invited', 'joined');
$$;

create or replace function public.shared_round_is_host(p_profile uuid, p_round uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shared_rounds where id = p_round and host = p_profile);
$$;

-- Host creates the round with up to 4 invites. Returns the round id.
create or replace function public.create_shared_round(p_host uuid, p_setup jsonb, p_invites uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_round uuid;
  v_invite uuid;
  v_position integer := 1;
begin
  if jsonb_typeof(p_setup) <> 'object' then raise exception 'Round setup is missing.' using errcode = '22023'; end if;
  if coalesce(array_length(p_invites, 1), 0) > 4 then raise exception 'Up to 4 invites.' using errcode = '22023'; end if;
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

-- Host invites one more (or re-invites someone who declined / was removed). Up to 5 players in all.
create or replace function public.invite_to_shared_round(p_host uuid, p_round uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not shared_round_is_host(p_host, p_round) then raise exception 'Only the host can invite.' using errcode = '42501'; end if;
  if p_profile = p_host then raise exception 'You can''t invite yourself.' using errcode = '22023'; end if;
  if exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status in ('invited', 'joined')) then return; end if;
  if shared_round_active_count(p_round) >= 5 then raise exception 'A round has up to 5 players.' using errcode = '22023'; end if;
  insert into shared_round_players (round_id, profile_id, position)
  values (p_round, p_profile, (select coalesce(max(position), 0) + 1 from shared_round_players where round_id = p_round))
  on conflict (round_id, profile_id) do update set status = 'invited', invited_at = now(), answered_at = null,
    position = (select coalesce(max(position), 0) + 1 from shared_round_players where round_id = p_round);
end $$;

-- Host removes a player or cancels an invite (never themselves).
create or replace function public.remove_from_shared_round(p_host uuid, p_round uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not shared_round_is_host(p_host, p_round) then raise exception 'Only the host can remove players.' using errcode = '42501'; end if;
  if p_profile = p_host then raise exception 'The host can''t be removed.' using errcode = '22023'; end if;
  update shared_round_players set status = 'removed', answered_at = now() where round_id = p_round and profile_id = p_profile;
end $$;

-- The invited player joins or declines.
create or replace function public.answer_shared_round_invite(p_profile uuid, p_round uuid, p_join boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shared_round_players set status = case when p_join then 'joined' else 'declined' end, answered_at = now()
  where round_id = p_round and profile_id = p_profile and status = 'invited'
    and exists (select 1 from shared_rounds where id = p_round and status = 'live');
  if not found then raise exception 'That invite is no longer open.' using errcode = '22023'; end if;
end $$;

-- My open invites (live rounds only), newest first.
create or replace function public.list_my_round_invites(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('roundId', r.id, 'hostName', h.display_name, 'setup', r.setup, 'startedAt', r.started_at)
    order by p.invited_at desc), '[]'::jsonb)
  from shared_round_players p join shared_rounds r on r.id = p.round_id join profiles h on h.id = r.host
  where p.profile_id = p_profile and p.status = 'invited' and r.status = 'live';
$$;

-- The whole round for the host or a joined player: setup, players (in order), strokes and picks. Null for anyone else.
create or replace function public.get_shared_round(p_profile uuid, p_round uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status = 'joined') then null else
    jsonb_build_object(
      'id', r.id, 'host', r.host, 'status', r.status, 'setup', r.setup, 'startedAt', r.started_at,
      'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'position', p.position, 'status', p.status) order by p.position), '[]'::jsonb)
                  from shared_round_players p join profiles pr on pr.id = p.profile_id where p.round_id = r.id),
      'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
                from shared_round_holes h where h.round_id = r.id),
      'picks', (select coalesce(jsonb_agg(jsonb_build_object('hole', k.hole, 'pick', k.pick)), '[]'::jsonb)
                from shared_round_picks k where k.round_id = r.id))
  end
  from shared_rounds r where r.id = p_round;
$$;

-- My live round (host or joined), newest first, so another phone can pick it up.
create or replace function public.my_live_shared_round(p_profile uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.id from shared_rounds r join shared_round_players p on p.round_id = r.id
  where p.profile_id = p_profile and p.status = 'joined' and r.status = 'live' order by r.started_at desc limit 1;
$$;

-- One player's strokes on one hole (null clears it). Players write their own; the host writes anyone still in the round.
create or replace function public.set_shared_round_strokes(p_profile uuid, p_round uuid, p_player uuid, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shared_rounds where id = p_round and status = 'live') then raise exception 'This round has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status = 'joined') then
    raise exception 'You''re not in this round.' using errcode = '42501';
  end if;
  if p_player <> p_profile and not shared_round_is_host(p_profile, p_round) then
    raise exception 'Only the host can enter another player''s score.' using errcode = '42501';
  end if;
  if not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_player and status in ('invited', 'joined')) then
    raise exception 'That player isn''t in this round.' using errcode = '22023';
  end if;
  insert into shared_round_holes (round_id, profile_id, hole, strokes, entered_by) values (p_round, p_player, p_hole, p_strokes, p_profile)
  on conflict (round_id, profile_id, hole) do update set strokes = excluded.strokes, entered_by = excluded.entered_by, updated_at = now();
end $$;

-- The game's pick for a hole (Wolf partner, Daytona spots…). Any joined player can set it.
create or replace function public.set_shared_round_pick(p_profile uuid, p_round uuid, p_hole integer, p_pick jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shared_rounds where id = p_round and status = 'live') then raise exception 'This round has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from shared_round_players where round_id = p_round and profile_id = p_profile and status = 'joined') then
    raise exception 'You''re not in this round.' using errcode = '42501';
  end if;
  insert into shared_round_picks (round_id, hole, pick) values (p_round, p_hole, coalesce(p_pick, '{}'::jsonb))
  on conflict (round_id, hole) do update set pick = excluded.pick, updated_at = now();
end $$;

-- Host changes the setup (e.g. the game) or ends the round.
create or replace function public.update_shared_round(p_host uuid, p_round uuid, p_setup jsonb, p_end boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not shared_round_is_host(p_host, p_round) then raise exception 'Only the host can change the round.' using errcode = '42501'; end if;
  update shared_rounds set setup = coalesce(p_setup, setup),
    status = case when p_end then 'ended' else status end, ended_at = case when p_end then now() else ended_at end
  where id = p_round;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'shared_round_active_count(uuid)', 'shared_round_is_host(uuid, uuid)', 'create_shared_round(uuid, jsonb, uuid[])',
    'invite_to_shared_round(uuid, uuid, uuid)', 'remove_from_shared_round(uuid, uuid, uuid)', 'answer_shared_round_invite(uuid, uuid, boolean)',
    'list_my_round_invites(uuid)', 'get_shared_round(uuid, uuid)', 'my_live_shared_round(uuid)',
    'set_shared_round_strokes(uuid, uuid, uuid, integer, integer)', 'set_shared_round_pick(uuid, uuid, integer, jsonb)', 'update_shared_round(uuid, uuid, jsonb, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
