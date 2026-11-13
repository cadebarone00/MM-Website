-- supabase/golf_trip_import_edits.sql
-- Import past trip → fixing results after the trip is added (project_specs.md, "Import past trip, phone-first").
--
-- A player whose account is linked to their name on an imported trip may change their own scores; the organizer may
-- change any score, match winner or round's hole pars (stats on imported trips, 2026-11-09). The server works out the new results from the requested changes and checks them
-- (lib/platform/pastTripModel.ts applyResultChanges); this function checks again who may change what, refuses a
-- stale revision (two phones editing at once), saves, and records every change in golf_trip_imported_edits.
--
-- Also makes get_golf_trip_imported_results answer { results, revision } so the page can send the revision back.
-- Prerequisites: golf_trips.sql, golf_trip_invitations.sql, golf_trip_import.sql. Safe to run more than once.
-- Undo: see the bottom.

begin;

alter table public.golf_trip_imported_results add column if not exists revision integer not null default 1;

create table if not exists public.golf_trip_imported_edits (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  -- The member row that made the change (kept if that member later leaves, as a name in history).
  member_id uuid references public.golf_trip_members(id) on delete set null,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists golf_trip_imported_edits_trip_idx on public.golf_trip_imported_edits (golf_trip_id, created_at);
alter table public.golf_trip_imported_edits enable row level security;
revoke all on public.golf_trip_imported_edits from public, anon, authenticated;
grant all on public.golf_trip_imported_edits to service_role;

-- p_changes: { scores: [{round, player, total, holes, putts, fairway, green}], matches: [{index, winner}], pars: [{round, holePars}] }
-- (player = member row id; pars optional).
-- p_results: the whole new results document. Returns the new revision.
create or replace function public.update_imported_trip_results(p_profile uuid, p_trip uuid, p_revision integer, p_changes jsonb, p_results jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_member golf_trip_members;
  v_saved golf_trip_imported_results;
begin
  select * into v_member from golf_trip_members
    where golf_trip_id = p_trip and profile_id = p_profile and invitation_status = 'accepted';
  select * into v_saved from golf_trip_imported_results where golf_trip_id = p_trip for update;
  if v_member.id is null or v_saved.golf_trip_id is null then
    raise exception 'Trip not found.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes->'scores') <> 'array' or jsonb_typeof(p_changes->'matches') <> 'array' or jsonb_typeof(p_results) <> 'object' then
    raise exception 'Invalid change.' using errcode = '22023';
  end if;
  if v_member.role <> 'organizer' and (jsonb_array_length(p_changes->'matches') > 0
      or jsonb_array_length(coalesce(p_changes->'pars', '[]'::jsonb)) > 0
      or exists (select 1 from jsonb_array_elements(p_changes->'scores') s where s->>'player' is distinct from v_member.id::text)) then
    raise exception 'You can only change your own scores.' using errcode = '42501';
  end if;
  if v_saved.revision <> p_revision then
    raise exception 'Someone else just changed these results. Reload and try again.' using errcode = '40001';
  end if;
  insert into golf_trip_imported_edits (golf_trip_id, member_id, changes, before, after)
    values (p_trip, v_member.id, p_changes, v_saved.results, p_results);
  update golf_trip_imported_results set results = p_results, revision = revision + 1 where golf_trip_id = p_trip;
  return v_saved.revision + 1;
end;
$$;
revoke all on function public.update_imported_trip_results(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_imported_trip_results(uuid, uuid, integer, jsonb, jsonb) to service_role;

-- Now answers { results, revision } (members only; null for anyone else or a trip that wasn't imported).
create or replace function public.get_golf_trip_imported_results(p_profile uuid, p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('results', r.results, 'revision', r.revision) from golf_trip_imported_results r
  where r.golf_trip_id = p_trip and public.is_golf_trip_member(p_trip, p_profile);
$$;
revoke all on function public.get_golf_trip_imported_results(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_golf_trip_imported_results(uuid, uuid) to service_role;

commit;

-- Undo (put the reader back as golf_trip_import.sql has it, then):
--   drop function if exists public.update_imported_trip_results(uuid, uuid, integer, jsonb, jsonb);
--   drop table if exists public.golf_trip_imported_edits;
--   alter table public.golf_trip_imported_results drop column if exists revision;
