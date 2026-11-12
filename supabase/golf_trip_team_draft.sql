-- Team Draft: saved, final picks (project_specs.md "Team Draft: picks are saved and final").
-- A drafted player belongs to that team for good: one row per pick, never updated or deleted by the app.
--
-- Who may do what (checked here, again after the server route's own check in lib/platform/teamDraftPicks.ts):
--   read    any accepted trip member
--   start   the trip's organizer
--   pick    the captain of the team on the clock (settings.draftCaptains in golf_trip_setup) or the organizer;
--           pick numbers run 1, 2, 3… so two people tapping at once can't both pick (the second gets 40001)
--   finish  writes the finished teams into the trip setup (submittedTeams) and marks the draft complete
-- Phones hear about new picks through Supabase Realtime (members only, via the read policies) and then reload through the
-- server, the same way live scoring works (golf_trip_scoring_realtime.sql).
--
-- Prerequisites: golf_trips.sql, golf_trip_setup.sql. Safe to run more than once.
-- Undo: drop table public.golf_trip_team_draft_picks, public.golf_trip_team_draft; and the four functions below.
begin;

create table if not exists public.golf_trip_team_draft (
  golf_trip_id uuid primary key references public.golf_trips(id) on delete cascade,
  started_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz
);

create table if not exists public.golf_trip_team_draft_picks (
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  pick_number integer not null check (pick_number between 1 and 64),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_index integer not null check (team_index between 0 and 63),
  picked_by uuid references public.profiles(id) on delete set null,
  picked_at timestamptz not null default now(),
  primary key (golf_trip_id, pick_number),
  unique (golf_trip_id, profile_id)
);

alter table public.golf_trip_team_draft enable row level security;
alter table public.golf_trip_team_draft_picks enable row level security;
revoke all on public.golf_trip_team_draft, public.golf_trip_team_draft_picks from public, anon, authenticated;
grant all on public.golf_trip_team_draft, public.golf_trip_team_draft_picks to service_role;
-- Read-only, members only: this is what lets Realtime tell a member's phone "a pick was made".
grant select on public.golf_trip_team_draft, public.golf_trip_team_draft_picks to authenticated;
drop policy if exists golf_trip_team_draft_select on public.golf_trip_team_draft;
create policy golf_trip_team_draft_select on public.golf_trip_team_draft for select to authenticated using (public.is_golf_trip_member(golf_trip_id, auth.uid()));
drop policy if exists golf_trip_team_draft_picks_select on public.golf_trip_team_draft_picks;
create policy golf_trip_team_draft_picks_select on public.golf_trip_team_draft_picks for select to authenticated using (public.is_golf_trip_member(golf_trip_id, auth.uid()));

create or replace function public.golf_trip_team_draft_accepted(p_trip uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and invitation_status = 'accepted');
$$;
revoke all on function public.golf_trip_team_draft_accepted(uuid, uuid) from public, anon, authenticated;

-- The draft as the server reads it: when it started / finished and every pick in order. Null for non-members.
create or replace function public.get_golf_trip_team_draft(p_profile uuid, p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_draft golf_trip_team_draft;
begin
  if not golf_trip_team_draft_accepted(p_trip, p_profile) then return null; end if;
  select * into v_draft from golf_trip_team_draft where golf_trip_id = p_trip;
  return jsonb_build_object(
    'startedAt', v_draft.started_at, 'completedAt', v_draft.completed_at,
    'picks', coalesce((select jsonb_agg(jsonb_build_object('pickNumber', pick_number, 'profileId', profile_id, 'team', team_index,
      'pickedBy', picked_by, 'pickedAt', picked_at) order by pick_number) from golf_trip_team_draft_picks where golf_trip_id = p_trip), '[]'::jsonb));
end;
$$;

-- The organizer opens the draft. Starting again does nothing.
create or replace function public.start_golf_trip_team_draft(p_profile uuid, p_trip uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer' and invitation_status = 'accepted') then
    raise exception 'Only the organizer can start the draft.' using errcode = '42501';
  end if;
  insert into golf_trip_team_draft(golf_trip_id, started_at, started_by) values (p_trip, now(), p_profile)
    on conflict (golf_trip_id) do update set started_at = coalesce(golf_trip_team_draft.started_at, excluded.started_at),
      started_by = coalesce(golf_trip_team_draft.started_by, excluded.started_by);
  return get_golf_trip_team_draft(p_profile, p_trip);
end;
$$;

-- One pick. p_team is the team on the clock as the server worked it out; p_team_count bounds it.
create or replace function public.make_golf_trip_team_draft_pick(p_profile uuid, p_trip uuid, p_pick_number integer, p_player uuid, p_team integer, p_team_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft golf_trip_team_draft;
  v_captains jsonb;
  v_organizer boolean;
begin
  -- One pick at a time per trip.
  select * into v_draft from golf_trip_team_draft where golf_trip_id = p_trip for update;
  if not golf_trip_team_draft_accepted(p_trip, p_profile) then raise exception 'Trip not found.' using errcode = '42501'; end if;
  if v_draft.started_at is null then raise exception 'The draft hasn''t started yet.' using errcode = '22023'; end if;
  if v_draft.completed_at is not null then raise exception 'The draft is over.' using errcode = '22023'; end if;
  if p_team_count not between 1 and 64 or p_team not between 0 and p_team_count - 1 then raise exception 'Invalid team.' using errcode = '22023'; end if;
  v_organizer := exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer' and invitation_status = 'accepted');
  select coalesce(settings->'draftCaptains', '{}'::jsonb) into v_captains from golf_trip_setup where golf_trip_id = p_trip;
  v_captains := coalesce(v_captains, '{}'::jsonb);
  if not v_organizer and coalesce(v_captains->>p_team::text, '') <> p_profile::text then raise exception 'It''s not your pick.' using errcode = '42501'; end if;
  if p_pick_number <> (select count(*) + 1 from golf_trip_team_draft_picks where golf_trip_id = p_trip) then
    raise exception 'That pick was already made.' using errcode = '40001';
  end if;
  if not golf_trip_team_draft_accepted(p_trip, p_player)
    or exists(select 1 from jsonb_each_text(v_captains) c where c.value = p_player::text)
    or exists(select 1 from golf_trip_team_draft_picks where golf_trip_id = p_trip and profile_id = p_player) then
    raise exception 'That player is already on a team.' using errcode = '22023';
  end if;
  insert into golf_trip_team_draft_picks(golf_trip_id, pick_number, profile_id, team_index, picked_by) values (p_trip, p_pick_number, p_player, p_team, p_profile);
  return get_golf_trip_team_draft(p_profile, p_trip);
end;
$$;

-- The last pick was made: save the teams (member positions, as Settings → Teams saves them) and close the draft.
create or replace function public.complete_golf_trip_team_draft(p_profile uuid, p_trip uuid, p_teams jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_draft golf_trip_team_draft;
begin
  select * into v_draft from golf_trip_team_draft where golf_trip_id = p_trip for update;
  if not golf_trip_team_draft_accepted(p_trip, p_profile) then raise exception 'Trip not found.' using errcode = '42501'; end if;
  if v_draft.started_at is null then raise exception 'The draft hasn''t started yet.' using errcode = '22023'; end if;
  if v_draft.completed_at is not null then return get_golf_trip_team_draft(p_profile, p_trip); end if;
  if jsonb_typeof(p_teams) <> 'array' or exists(select 1 from jsonb_array_elements(p_teams) t where jsonb_typeof(t) <> 'array') then
    raise exception 'Invalid teams.' using errcode = '22023';
  end if;
  update golf_trip_setup set settings = jsonb_set(settings, '{submittedTeams}', p_teams), revision = revision + 1, last_write_id = gen_random_uuid(), updated_at = now()
    where golf_trip_id = p_trip;
  update golf_trip_team_draft set completed_at = now() where golf_trip_id = p_trip;
  return get_golf_trip_team_draft(p_profile, p_trip);
end;
$$;

revoke all on function public.get_golf_trip_team_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_golf_trip_team_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.make_golf_trip_team_draft_pick(uuid, uuid, integer, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_golf_trip_team_draft(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_golf_trip_team_draft(uuid, uuid) to service_role;
grant execute on function public.start_golf_trip_team_draft(uuid, uuid) to service_role;
grant execute on function public.make_golf_trip_team_draft_pick(uuid, uuid, integer, uuid, integer, integer) to service_role;
grant execute on function public.complete_golf_trip_team_draft(uuid, uuid, jsonb) to service_role;

-- Realtime: tell members' phones when a pick lands or the draft starts / finishes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_trip_team_draft_picks') then
      alter publication supabase_realtime add table public.golf_trip_team_draft_picks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_trip_team_draft') then
      alter publication supabase_realtime add table public.golf_trip_team_draft;
    end if;
  end if;
end $$;

commit;
