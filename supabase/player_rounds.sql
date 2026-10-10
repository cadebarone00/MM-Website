-- supabase/player_rounds.sql
-- Player rounds: one saved round per golfer PROFILE per round played (a golf trip round, later tournament / logged-myself /
-- past-trip rounds). The trip, Profile → Rounds and the handicap all read this one record — never a copy. Plus each
-- profile's Rounds privacy (Settings → Privacy). See project_specs.md, "Player rounds Step 2A — database foundation".
--
-- A round belongs to a profile (profile_id → profiles.id, the golfer), not to a trip or a login: deleting a trip later keeps the player's round (source_label keeps
-- the trip's name). source_key ("trip:<trip id>:<round id>") is unique per profile, so a round can only be saved once;
-- saving it again returns the round already saved (locked after submit).
--
-- Course and tee are snapshots taken when the round was submitted (course_ref = the course API's id), so a later
-- change to the course data never changes a past round. holes is the hole-by-hole card as JSON
-- ([{number, par, strokes, putts, fairway, green}], empty for a total-only past-trip round).
--
-- The server works out whether a round counts toward handicap (lib/platform/playerRounds.ts); save_player_round
-- re-checks it: total = the holes' strokes, a counted round is the player's own 18 holes with a rating + slope and
-- the right differential ((total − rating) × 113 / slope), a round that doesn't count says why.
--
-- Access: nobody reads or writes the table directly (RLS on, no policies). The server calls the functions below with
-- the signed-in user's id, using the service-role key (lib/platform/playerRoundsServer.ts). Nothing here returns one
-- profile's rounds to another profile.
--
-- Source identity (project_specs.md, "Rounds follow profile identity"): every finished round says exactly which real
-- round it was, never by course + date. source_key is built from the context ids:
--   trip        'trip:<golf_trip_id>:<golf_trip_round_id>'
--   tournament  'tournament:<edition_id>:<edition_round_id>'   (+ tournament_player_id, the player in that tournament)
--   personal    'personal:<personal_round_id>'                 (a stable id made when the golfer starts the round)
--   history     free-form (organizer-entered past trips, lib/platform/historyLinks.ts)
--   legacy      imported from the original Maroon system (supabase/legacy_round_import.sql): 'legacy:maroon:<year>:r<round>'
--               or 'legacy:handicap:<handicap_rounds.id>', with provenance (which old record) and imported_at
-- The context ids are plain uuids with NO foreign keys on purpose: a finished round is the golfer's history and must
-- survive the trip, round, tournament or scorecard being deleted (those tables cascade), and this file never has to
-- run after the scoring files. publish_player_round is the one door the scoring side uses: revision 1 creates the row,
-- an approved correction (a higher revision) updates the SAME row, a replay changes nothing.
-- See docs/player-rounds-scoring-contract.md.
--
-- Prerequisite: schema.sql (profiles). Safe to run more than once. Undo: see the bottom of this file.

begin;

create table if not exists public.player_rounds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('trip', 'tournament', 'personal', 'history')),
  source_key text not null check (length(source_key) between 1 and 200),
  source_label text check (length(source_label) <= 120),
  date_played date not null,
  course_ref text check (length(course_ref) <= 200),
  course_name text not null check (length(trim(course_name)) between 1 and 200),
  course_place text not null default '' check (length(course_place) <= 200),
  tee_name text check (length(tee_name) <= 60),
  tee_rating numeric check (tee_rating between 20 and 90),
  tee_slope integer check (tee_slope between 55 and 155),
  holes_played integer not null check (holes_played in (9, 18)),
  format text not null check (length(trim(format)) between 1 and 60),
  holes jsonb not null default '[]'::jsonb check (jsonb_typeof(holes) = 'array' and jsonb_array_length(holes) <= holes_played),
  total integer not null check (total between 18 and 200),
  counts_for_handicap boolean not null,
  not_counted_reason text check (length(not_counted_reason) <= 200),
  differential numeric,
  entered_by text not null check (entered_by in ('player', 'organizer')),
  created_at timestamptz not null default now(),
  unique (profile_id, source_key),
  -- Counted: the player's own full 18 with a rating + slope. Not counted: a reason and no differential.
  check (case when counts_for_handicap
    then entered_by = 'player' and holes_played = 18 and jsonb_array_length(holes) = 18 and tee_rating is not null and tee_slope is not null
      and differential is not null and not_counted_reason is null
    else differential is null and not_counted_reason is not null end)
);
create index if not exists player_rounds_profile_idx on public.player_rounds (profile_id, date_played desc);

-- Where the round came from (see the header). All nullable: rows saved before this existed keep working.
alter table public.player_rounds add column if not exists golf_trip_id uuid;
alter table public.player_rounds add column if not exists golf_trip_round_id uuid;
alter table public.player_rounds add column if not exists edition_id uuid;
alter table public.player_rounds add column if not exists edition_round_id uuid;
alter table public.player_rounds add column if not exists tournament_player_id uuid;
alter table public.player_rounds add column if not exists personal_round_id uuid;
-- The official card this row was published from (scorecard_submissions.id for a trip) and its revision.
alter table public.player_rounds add column if not exists scorecard_submission_id uuid;
alter table public.player_rounds add column if not exists submission_revision integer;
-- Personal rounds only: null = follow the profile's Rounds privacy.
alter table public.player_rounds add column if not exists visibility text;
-- The golfer hid it from their Rounds, Stats and handicap; the trip / tournament still has its own card.
alter table public.player_rounds add column if not exists removed_from_profile boolean not null default false;
alter table public.player_rounds add column if not exists updated_at timestamptz;

alter table public.player_rounds drop constraint if exists player_rounds_source_identity;
alter table public.player_rounds add constraint player_rounds_source_identity check (
  -- Each source only carries its own ids…
  (source = 'trip' or (golf_trip_id is null and golf_trip_round_id is null))
  and (source = 'tournament' or (edition_id is null and edition_round_id is null and tournament_player_id is null))
  and (source = 'personal' or (personal_round_id is null and visibility is null))
  -- …and when they are there, the key is exactly made of them (so one real round = one key).
  and (golf_trip_id is null or (golf_trip_round_id is not null and source_key = 'trip:' || golf_trip_id || ':' || golf_trip_round_id))
  and (golf_trip_round_id is null or golf_trip_id is not null)
  and (edition_id is null or (edition_round_id is not null and source_key = 'tournament:' || edition_id || ':' || edition_round_id))
  and (edition_round_id is null or edition_id is not null)
  and (personal_round_id is null or source_key = 'personal:' || personal_round_id)
  and (visibility is null or visibility in ('public', 'private'))
  and (submission_revision is null or submission_revision >= 1)
);
-- One official card feeds at most one history row.
create unique index if not exists player_rounds_submission_idx on public.player_rounds (scorecard_submission_id) where scorecard_submission_id is not null;

-- Historical rounds imported from the original Maroon system are ordinary rows with source 'legacy' and a record of
-- where each came from (provenance: { system, recordId, playerSlug, seasonYear, round, ... }). Only the import tool
-- writes them; see supabase/legacy_round_import.sql.
alter table public.player_rounds drop constraint if exists player_rounds_source_check;
alter table public.player_rounds add constraint player_rounds_source_check check (source in ('trip', 'tournament', 'personal', 'history', 'legacy'));
alter table public.player_rounds add column if not exists provenance jsonb;
alter table public.player_rounds add column if not exists imported_at timestamptz;
alter table public.player_rounds drop constraint if exists player_rounds_legacy_provenance;
alter table public.player_rounds add constraint player_rounds_legacy_provenance check (
  source <> 'legacy' or (source_key like 'legacy:%' and jsonb_typeof(provenance) = 'object' and provenance ? 'system' and imported_at is not null));

-- Settings → Privacy. Private: only you see your Rounds (people you play with still see your handicap index, once
-- other players' profiles can be viewed). New profiles start private.
alter table public.profiles add column if not exists rounds_visibility text not null default 'private';
alter table public.profiles drop constraint if exists profiles_rounds_visibility_check;
alter table public.profiles add constraint profiles_rounds_visibility_check check (rounds_visibility in ('public', 'private'));

alter table public.player_rounds enable row level security;
revoke all on public.player_rounds from anon, authenticated;

-- One row as the app reads it (camelCase, the shape lib/platform/playerRoundsRows.ts checks).
create or replace function public.player_round_json(r public.player_rounds)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'profileId', r.profile_id, 'source', r.source, 'sourceKey', r.source_key, 'sourceLabel', r.source_label,
    'datePlayed', r.date_played, 'course', jsonb_build_object('ref', r.course_ref, 'name', r.course_name, 'place', r.course_place),
    'tee', case when r.tee_name is null then null else jsonb_build_object('name', r.tee_name, 'rating', r.tee_rating, 'slope', r.tee_slope) end,
    'holesPlayed', r.holes_played, 'format', r.format, 'holes', r.holes, 'total', r.total,
    'countsForHandicap', r.counts_for_handicap, 'notCountedReason', r.not_counted_reason, 'differential', r.differential,
    'enteredBy', r.entered_by, 'createdAt', r.created_at, 'removedFromProfile', r.removed_from_profile)
  || jsonb_strip_nulls(jsonb_build_object(
    'tripId', r.golf_trip_id, 'tripRoundId', r.golf_trip_round_id, 'editionId', r.edition_id, 'editionRoundId', r.edition_round_id,
    'tournamentPlayerId', r.tournament_player_id, 'personalRoundId', r.personal_round_id,
    'scorecardSubmissionId', r.scorecard_submission_id, 'submissionRevision', r.submission_revision,
    'visibility', r.visibility, 'updatedAt', r.updated_at, 'provenance', r.provenance, 'importedAt', r.imported_at));
$$;

-- The round rules both doors share. Raises if p_round breaks one.
create or replace function public.assert_player_round(p_profile uuid, p_round jsonb)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_holes jsonb := coalesce(p_round->'holes', '[]'::jsonb);
  v_total integer := (p_round->>'total')::integer;
  v_rating numeric := (p_round->'tee'->>'rating')::numeric;
  v_slope integer := (p_round->'tee'->>'slope')::integer;
  v_counts boolean := coalesce((p_round->>'countsForHandicap')::boolean, false);
  v_differential numeric := (p_round->>'differential')::numeric;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_holes) <> 'array' then
    raise exception 'Holes must be a list.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_holes) h
             where jsonb_typeof(h->'strokes') <> 'number' or (h->>'strokes')::numeric not between 1 and 20 or (h->>'strokes')::numeric % 1 <> 0) then
    raise exception 'Every hole needs 1–20 strokes.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_holes) > 0 and v_total <> (select sum((h->>'strokes')::integer) from jsonb_array_elements(v_holes) h) then
    raise exception 'The total doesn''t match the holes.' using errcode = '22023';
  end if;
  if v_counts and (v_rating is null or v_slope is null or v_differential is null
                   or abs(v_differential - (v_total - v_rating) * 113 / v_slope) > 0.051) then
    raise exception 'That handicap differential doesn''t match the course rating.' using errcode = '22023';
  end if;
end;
$$;

-- Save my round (p_round = playerRoundPayload in lib/platform/playerRoundsRows.ts). New → { saved: true, round };
-- already saved → { saved: false, round: the one already saved } and nothing changes.
create or replace function public.save_player_round(p_profile uuid, p_round jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_holes jsonb := coalesce(p_round->'holes', '[]'::jsonb);
  v_total integer := (p_round->>'total')::integer;
  v_rating numeric := (p_round->'tee'->>'rating')::numeric;
  v_slope integer := (p_round->'tee'->>'slope')::integer;
  v_counts boolean := coalesce((p_round->>'countsForHandicap')::boolean, false);
  v_differential numeric := (p_round->>'differential')::numeric;
  v_row public.player_rounds;
begin
  perform assert_player_round(p_profile, p_round);

  insert into player_rounds (profile_id, source, source_key, source_label, date_played, course_ref, course_name, course_place,
    tee_name, tee_rating, tee_slope, holes_played, format, holes, total, counts_for_handicap, not_counted_reason, differential, entered_by)
  values (p_profile, p_round->>'source', p_round->>'sourceKey', nullif(trim(p_round->>'sourceLabel'), ''), (p_round->>'datePlayed')::date,
    nullif(p_round->'course'->>'ref', ''), trim(p_round->'course'->>'name'), coalesce(p_round->'course'->>'place', ''),
    nullif(trim(p_round->'tee'->>'name'), ''), v_rating, v_slope, (p_round->>'holesPlayed')::integer, trim(p_round->>'format'),
    v_holes, v_total, v_counts, p_round->>'notCountedReason', v_differential, p_round->>'enteredBy')
  on conflict (profile_id, source_key) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object('saved', true, 'round', player_round_json(v_row));
  end if;
  select * into v_row from player_rounds where profile_id = p_profile and source_key = p_round->>'sourceKey';
  return jsonb_build_object('saved', false, 'round', player_round_json(v_row));
end;
$$;

-- My rounds, newest first.
create or replace function public.list_my_player_rounds(p_profile uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(player_round_json(r) order by r.date_played desc, r.created_at desc), '[]'::jsonb)
  from player_rounds r where r.profile_id = p_profile;
$$;

-- Publish a finished round into the golfer's history — the door the scoring side calls (inside its own submit /
-- approve-correction transaction). p_round = playerRoundPayload plus
--   context: { golfTripId, golfTripRoundId | editionId, editionRoundId, tournamentPlayerId | personalRoundId,
--              scorecardSubmissionId, submissionRevision }
-- The key is built from the context (a sourceKey sent along must match it). Result:
--   created    first time this profile + round is seen
--   updated    a higher submissionRevision (an approved correction): the SAME row is rewritten, id and created_at kept
--   unchanged  a replay or an older revision: nothing changes (safe to retry)
-- A refused round raises, so the caller's transaction rolls back and nothing is half-written.
create or replace function public.publish_player_round(p_profile uuid, p_round jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := coalesce(p_round->'context', '{}'::jsonb);
  v_source text := p_round->>'source';
  v_revision integer := coalesce((c->>'submissionRevision')::integer, 1);
  v_key text;
  v_old public.player_rounds;
  v_row public.player_rounds;
begin
  perform assert_player_round(p_profile, p_round);
  v_key := case v_source
    when 'trip' then 'trip:' || (c->>'golfTripId')::uuid || ':' || (c->>'golfTripRoundId')::uuid
    when 'tournament' then 'tournament:' || (c->>'editionId')::uuid || ':' || (c->>'editionRoundId')::uuid
    when 'personal' then 'personal:' || (c->>'personalRoundId')::uuid
    else nullif(p_round->>'sourceKey', '') end;
  if v_key is null then
    raise exception 'Which round is this? A % round needs its round ids.', coalesce(v_source, 'unknown') using errcode = '22023';
  end if;
  if p_round->>'sourceKey' is not null and p_round->>'sourceKey' <> v_key then
    raise exception 'The round key doesn''t match its round ids.' using errcode = '22023';
  end if;
  if v_revision < 1 then
    raise exception 'Revisions start at 1.' using errcode = '22023';
  end if;

  select * into v_old from player_rounds where profile_id = p_profile and source_key = v_key for update;
  if not found then
    insert into player_rounds (profile_id, source, source_key, source_label, date_played, course_ref, course_name, course_place,
      tee_name, tee_rating, tee_slope, holes_played, format, holes, total, counts_for_handicap, not_counted_reason, differential, entered_by,
      golf_trip_id, golf_trip_round_id, edition_id, edition_round_id, tournament_player_id, personal_round_id,
      scorecard_submission_id, submission_revision, visibility)
    values (p_profile, v_source, v_key, nullif(trim(p_round->>'sourceLabel'), ''), (p_round->>'datePlayed')::date,
      nullif(p_round->'course'->>'ref', ''), trim(p_round->'course'->>'name'), coalesce(p_round->'course'->>'place', ''),
      nullif(trim(p_round->'tee'->>'name'), ''), (p_round->'tee'->>'rating')::numeric, (p_round->'tee'->>'slope')::integer,
      (p_round->>'holesPlayed')::integer, trim(p_round->>'format'), coalesce(p_round->'holes', '[]'::jsonb), (p_round->>'total')::integer,
      coalesce((p_round->>'countsForHandicap')::boolean, false), p_round->>'notCountedReason', (p_round->>'differential')::numeric, p_round->>'enteredBy',
      (c->>'golfTripId')::uuid, (c->>'golfTripRoundId')::uuid, (c->>'editionId')::uuid, (c->>'editionRoundId')::uuid,
      (c->>'tournamentPlayerId')::uuid, (c->>'personalRoundId')::uuid, (c->>'scorecardSubmissionId')::uuid, v_revision,
      nullif(c->>'visibility', ''))
    on conflict (profile_id, source_key) do nothing
    returning * into v_row;
    if v_row.id is not null then
      return jsonb_build_object('result', 'created', 'round', player_round_json(v_row));
    end if;
    -- Another call saved it a moment ago: treat this one like a replay.
    select * into v_old from player_rounds where profile_id = p_profile and source_key = v_key for update;
  end if;

  if v_revision <= coalesce(v_old.submission_revision, 1) then
    return jsonb_build_object('result', 'unchanged', 'round', player_round_json(v_old));
  end if;
  -- An approved correction: the same row, new numbers. The golfer's own choices (hidden, visibility) are kept.
  update player_rounds set
    source_label = coalesce(nullif(trim(p_round->>'sourceLabel'), ''), source_label), date_played = (p_round->>'datePlayed')::date,
    course_ref = nullif(p_round->'course'->>'ref', ''), course_name = trim(p_round->'course'->>'name'), course_place = coalesce(p_round->'course'->>'place', ''),
    tee_name = nullif(trim(p_round->'tee'->>'name'), ''), tee_rating = (p_round->'tee'->>'rating')::numeric, tee_slope = (p_round->'tee'->>'slope')::integer,
    holes_played = (p_round->>'holesPlayed')::integer, format = trim(p_round->>'format'), holes = coalesce(p_round->'holes', '[]'::jsonb),
    total = (p_round->>'total')::integer, counts_for_handicap = coalesce((p_round->>'countsForHandicap')::boolean, false),
    not_counted_reason = p_round->>'notCountedReason', differential = (p_round->>'differential')::numeric, entered_by = p_round->>'enteredBy',
    tournament_player_id = coalesce((c->>'tournamentPlayerId')::uuid, tournament_player_id),
    scorecard_submission_id = coalesce((c->>'scorecardSubmissionId')::uuid, scorecard_submission_id),
    submission_revision = v_revision, updated_at = now()
  where id = v_old.id
  returning * into v_row;
  return jsonb_build_object('result', 'updated', 'round', player_round_json(v_row));
end;
$$;

-- Every modern finished round of one golfer (trip, tournament, personal, history), newest first, as p_viewer may see
-- it (p_viewer null = signed out). Hidden rounds never show. The owner sees the rest. Anyone else needs the owner's
-- Rounds set to Public, and a personal round must be Public itself (null = the profile's setting). A round being part
-- of a public tournament or trip never makes it public here. Other viewers never get the owner's profile id, the
-- scoring-side ids or an imported round's provenance (it names the old player slot).
create or replace function public.list_profile_rounds(p_viewer uuid, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
      case when p_viewer = p_owner then player_round_json(r)
        else player_round_json(r) - 'profileId' - 'scorecardSubmissionId' - 'tournamentPlayerId' - 'removedFromProfile' - 'provenance' end
      order by r.date_played desc, r.created_at desc), '[]'::jsonb)
  from player_rounds r join profiles p on p.id = r.profile_id
  where r.profile_id = p_owner and not r.removed_from_profile
    and (p_viewer = p_owner or (p.rounds_visibility = 'public'
      and (r.source <> 'personal' or coalesce(r.visibility, p.rounds_visibility) = 'public')));
$$;

create or replace function public.get_rounds_visibility(p_profile uuid)
returns text
language sql stable security definer set search_path = public as $$
  select rounds_visibility from profiles where id = p_profile;
$$;

create or replace function public.set_rounds_visibility(p_profile uuid, p_visibility text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_visibility not in ('public', 'private') then
    raise exception 'Choose public or private.' using errcode = '22023';
  end if;
  update profiles set rounds_visibility = p_visibility where id = p_profile;
  if not found then raise exception 'No account found.' using errcode = '42501'; end if;
  return p_visibility;
end;
$$;

revoke all on function public.player_round_json(public.player_rounds) from public, anon, authenticated;
revoke all on function public.assert_player_round(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_player_round(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.publish_player_round(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_profile_rounds(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_my_player_rounds(uuid) from public, anon, authenticated;
revoke all on function public.get_rounds_visibility(uuid) from public, anon, authenticated;
revoke all on function public.set_rounds_visibility(uuid, text) from public, anon, authenticated;
grant execute on function public.save_player_round(uuid, jsonb) to service_role;
grant execute on function public.list_my_player_rounds(uuid) to service_role;
grant execute on function public.publish_player_round(uuid, jsonb) to service_role;
grant execute on function public.list_profile_rounds(uuid, uuid) to service_role;
grant execute on function public.get_rounds_visibility(uuid) to service_role;
grant execute on function public.set_rounds_visibility(uuid, text) to service_role;

commit;

-- Undo (only if nothing depends on it yet — this deletes every saved round):
--   Legacy import columns only (first delete imported rows: delete from public.player_rounds where source = 'legacy';):
--     alter table public.player_rounds drop constraint if exists player_rounds_legacy_provenance;
--     alter table public.player_rounds drop constraint if exists player_rounds_source_check;
--     alter table public.player_rounds add constraint player_rounds_source_check check (source in ('trip', 'tournament', 'personal', 'history'));
--   Source identity only (keeps every round):
--     drop function if exists public.list_profile_rounds(uuid, uuid), public.publish_player_round(uuid, jsonb);
--     drop index if exists public.player_rounds_submission_idx;
--     alter table public.player_rounds drop constraint if exists player_rounds_source_identity;
--     (the added columns can stay; they are all nullable / defaulted)
--   Everything:
--   drop function if exists public.list_profile_rounds(uuid, uuid), public.publish_player_round(uuid, jsonb), public.assert_player_round(uuid, jsonb);
--   drop function if exists public.set_rounds_visibility(uuid, text), public.get_rounds_visibility(uuid),
--     public.list_my_player_rounds(uuid), public.save_player_round(uuid, jsonb), public.player_round_json(public.player_rounds);
--   drop table if exists public.player_rounds;
--   alter table public.profiles drop constraint if exists profiles_rounds_visibility_check;
--   alter table public.profiles drop column if exists rounds_visibility;
