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
    'enteredBy', r.entered_by, 'createdAt', r.created_at);
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
revoke all on function public.save_player_round(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_my_player_rounds(uuid) from public, anon, authenticated;
revoke all on function public.get_rounds_visibility(uuid) from public, anon, authenticated;
revoke all on function public.set_rounds_visibility(uuid, text) from public, anon, authenticated;
grant execute on function public.save_player_round(uuid, jsonb) to service_role;
grant execute on function public.list_my_player_rounds(uuid) to service_role;
grant execute on function public.get_rounds_visibility(uuid) to service_role;
grant execute on function public.set_rounds_visibility(uuid, text) to service_role;

commit;

-- Undo (only if nothing depends on it yet — this deletes every saved round):
--   drop function if exists public.set_rounds_visibility(uuid, text), public.get_rounds_visibility(uuid),
--     public.list_my_player_rounds(uuid), public.save_player_round(uuid, jsonb), public.player_round_json(public.player_rounds);
--   drop table if exists public.player_rounds;
--   alter table public.profiles drop constraint if exists profiles_rounds_visibility_check;
--   alter table public.profiles drop column if exists rounds_visibility;
