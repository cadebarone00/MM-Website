-- Match Selection: saved, final (project_specs.md "Match Selection: rebuilt room, captains, saved and final").
-- One row per trip round. The rules (turns, timers, who may act, what each person may see) live in
-- lib/platform/matchSelection.ts and run on our server; this file stores the result safely:
--   * only the server can read or write a round's state (it holds hidden Ranks / unsubmitted Response picks);
--   * every save says which version it started from, so two people acting at once can't overwrite each other (40001);
--   * only the organizer can create (start / randomize) a round's selection; only trip members can change it;
--   * every placed player must be an accepted member, and nobody can be placed twice;
--   * once complete it can't be changed, and finishing writes the matches into the trip setup.
-- Phones hear about changes through golf_trip_match_selection_versions (Realtime, members only): just the version
-- number — never the picks — so nothing hidden leaks; the phone then reloads through the server.
--
-- Prerequisites: golf_trips.sql, golf_trip_setup.sql. Safe to run more than once.
-- Undo: drop table public.golf_trip_match_selection_versions, public.golf_trip_match_selection; and the two functions below.
begin;

create table if not exists public.golf_trip_match_selection (
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  round_key text not null check (round_key ~ '^[0-9]{1,2}-[0-9]$'),
  selection_type text not null check (selection_type in ('Response', 'Ranks', 'Randomized')),
  version integer not null default 1,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 65536),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (golf_trip_id, round_key)
);
create table if not exists public.golf_trip_match_selection_versions (
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  round_key text not null,
  version integer not null,
  updated_at timestamptz not null default now(),
  primary key (golf_trip_id, round_key)
);

alter table public.golf_trip_match_selection enable row level security;
alter table public.golf_trip_match_selection_versions enable row level security;
revoke all on public.golf_trip_match_selection, public.golf_trip_match_selection_versions from public, anon, authenticated;
grant all on public.golf_trip_match_selection, public.golf_trip_match_selection_versions to service_role;
-- Members may read only the version numbers (that's what Realtime tells their phones).
grant select on public.golf_trip_match_selection_versions to authenticated;
drop policy if exists golf_trip_match_selection_versions_select on public.golf_trip_match_selection_versions;
create policy golf_trip_match_selection_versions_select on public.golf_trip_match_selection_versions for select to authenticated using (public.is_golf_trip_member(golf_trip_id, auth.uid()));

-- A round's saved selection for the server: version 0 / state null when it hasn't started. Null for non-members.
create or replace function public.get_golf_trip_match_selection(p_profile uuid, p_trip uuid, p_round text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_row golf_trip_match_selection;
begin
  if not exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and invitation_status = 'accepted') then return null; end if;
  select * into v_row from golf_trip_match_selection where golf_trip_id = p_trip and round_key = p_round;
  return jsonb_build_object('version', coalesce(v_row.version, 0), 'state', v_row.state, 'completedAt', v_row.completed_at);
end;
$$;

-- Save a round's new state (after the server applied the rules). p_version = the version it was based on (0 = new).
-- p_results (when the round just finished): the matches as member positions, [{ "a": [..], "b": [..] }, ...].
create or replace function public.save_golf_trip_match_selection(p_profile uuid, p_trip uuid, p_round text, p_version integer, p_type text, p_state jsonb, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row golf_trip_match_selection;
  v_version integer;
begin
  perform id from golf_trips where id = p_trip for update; -- one save at a time per trip
  if not exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and invitation_status = 'accepted') then
    raise exception 'Trip not found.' using errcode = '42501';
  end if;
  select * into v_row from golf_trip_match_selection where golf_trip_id = p_trip and round_key = p_round;
  if coalesce(v_row.version, 0) <> p_version then raise exception 'Someone else just changed this round. It has been reloaded.' using errcode = '40001'; end if;
  if v_row.completed_at is not null then raise exception 'This round''s matches are already set.' using errcode = '22023'; end if;
  if v_row.golf_trip_id is null and not exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer' and invitation_status = 'accepted') then
    raise exception 'Only the organizer can start match selection.' using errcode = '42501';
  end if;
  if p_type not in ('Response', 'Ranks', 'Randomized') or (v_row.golf_trip_id is not null and v_row.selection_type <> p_type)
    or jsonb_typeof(p_state) <> 'object' or jsonb_typeof(coalesce(p_state->'spots', '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid match selection.' using errcode = '22023';
  end if;
  -- Every placed player is an accepted member, and nobody is placed twice.
  if exists(select 1 from jsonb_array_elements(coalesce(p_state->'spots', '[]'::jsonb)) s
      where not exists(select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.invitation_status = 'accepted' and m.profile_id::text = s->>'profileId'))
    or (select count(*) from jsonb_array_elements(coalesce(p_state->'spots', '[]'::jsonb))) <> (select count(distinct s->>'profileId') from jsonb_array_elements(coalesce(p_state->'spots', '[]'::jsonb)) s) then
    raise exception 'A player can only be placed once, and only trip members can be placed.' using errcode = '22023';
  end if;
  v_version := coalesce(v_row.version, 0) + 1;
  insert into golf_trip_match_selection(golf_trip_id, round_key, selection_type, version, state, completed_at)
    values (p_trip, p_round, p_type, v_version, p_state, case when p_results is not null then now() end)
    on conflict (golf_trip_id, round_key) do update set version = excluded.version, state = excluded.state, completed_at = excluded.completed_at, updated_at = now();
  insert into golf_trip_match_selection_versions(golf_trip_id, round_key, version) values (p_trip, p_round, v_version)
    on conflict (golf_trip_id, round_key) do update set version = excluded.version, updated_at = now();
  -- Finished: save the matches with the round and mark the round done (Home shows "Match selection complete").
  if p_results is not null then
    if jsonb_typeof(p_results) <> 'array' then raise exception 'Invalid match results.' using errcode = '22023'; end if;
    update golf_trip_setup set
      settings = jsonb_set(jsonb_set(settings, '{matchSelectionResults}', coalesce(settings->'matchSelectionResults', '{}'::jsonb) || jsonb_build_object(p_round, p_results)),
        '{completedMatchDrafts}', (select coalesce(jsonb_agg(distinct k), '[]'::jsonb) from (select jsonb_array_elements_text(coalesce(settings->'completedMatchDrafts', '[]'::jsonb)) k union select p_round) keys)),
      revision = revision + 1, last_write_id = gen_random_uuid(), updated_at = now()
      where golf_trip_id = p_trip;
  end if;
  return jsonb_build_object('version', v_version);
end;
$$;

revoke all on function public.get_golf_trip_match_selection(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.save_golf_trip_match_selection(uuid, uuid, text, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_golf_trip_match_selection(uuid, uuid, text) to service_role;
grant execute on function public.save_golf_trip_match_selection(uuid, uuid, text, integer, text, jsonb, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_trip_match_selection_versions') then
    alter publication supabase_realtime add table public.golf_trip_match_selection_versions;
  end if;
end $$;

commit;
