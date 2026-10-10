-- supabase/legacy_round_import.sql
-- Legacy Maroon rounds → player_rounds (project_specs.md, "Legacy Maroon rounds → modern profile history").
-- Migration TOOLING: installing this file changes no data. Nothing is imported until someone runs, by hand:
--
--   select public.import_legacy_rounds(true);            -- DRY RUN: the full report, nothing written
--   select public.import_legacy_rounds(false);           -- import (safe to run again: already-imported rounds are skipped)
--   select public.import_legacy_rounds(true, 'cade-barone');   -- one player only (dry run or import)
--
-- The old tables are only READ. Nothing is deleted or changed there.
--
-- Sources (the full audit is in project_specs.md):
--   handicap_rounds (+ handicap_round_holes)                       a player's own logged rounds; rating / slope stored
--   archived_scorecard_rounds (+ archived_scorecard_holes)         2024–2026 Maroon Tournament cards; tees from
--                                                                  round_format_setups, else the round's handicap_setup
--   career_archive_rounds (+ career_archive_live_holes)            2027+ Maroon Tournament cards; only 'submitted' /
--                                                                  'final' rounds; the 2034 rehearsal season is left out
--
-- Identity: every round's source_key is built from the original record, never from date / course / score:
--   'legacy:maroon:<season year>:r<round>'   one Maroon Tournament round of one player. The same key whichever table
--                                            holds it, so a round in both archives imports ONCE (the 2024–26 archive wins).
--   'legacy:handicap:<handicap_rounds.id>'   one logged round (two rounds at one course on one day are two ids).
-- player_rounds is unique on (profile_id, source_key), so running the import twice never duplicates a round.
--
-- Player mapping (legacy_player_mapping): an old player slot maps to a profile only when exactly one profile carries
-- that slug (profiles.player_slug) AND the slot isn't claimed by someone else (player_slots.claimed_by). Anything else
-- is refused and reported — never guessed by name or email. The slug is a migration bridge only, not identity.
--
-- Handicap: a round counts only with an own-ball format, all 18 holes, one verified tee with a rating and slope (a
-- mixed-tee layout needs a composite rating nobody has verified). Everything else imports for history and stats with a
-- reason. The old handicap tables stay as they are until the modern index is confirmed to match.
--
-- All functions are service-role only. Prerequisites: schema.sql, career_live_archive.sql, archived_handicap_tees.sql,
-- round_format_setups.sql, player_rounds.sql (with the 'legacy' source). Safe to run more than once.
-- Undo (tool only): drop function if exists public.import_legacy_rounds(boolean, text), public.legacy_round_candidates(),
--   public.legacy_player_mapping(), public.legacy_own_ball_format(text);
-- Undo (imported rows too): delete from public.player_rounds where source = 'legacy';

begin;

-- The formats where a player posts their own score for the whole round (same list as lib/handicap/archiveIndex.ts).
create or replace function public.legacy_own_ball_format(p_format text)
returns boolean
language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(p_format, '')), '[^a-z]', '', 'g') in ('singles', 'fourball', 'individual', 'strokeplay',
    'individualstrokeplay', 'matchplay', 'individualmatchplay', 'fourballmatchplay', 'fourballstrokeplay');
$$;

-- Every old player slot that has any historical round, and the one profile it maps to (or why it doesn't).
create or replace function public.legacy_player_mapping()
returns table (player_slug text, profile_id uuid, username text, problem text)
language sql stable security definer set search_path = public as $$
  with slugs as (
    select h.player_slug from handicap_rounds h
    union select a.player_slug from archived_scorecard_rounds a
    union select c.player_slug from career_archive_rounds c
  ), linked as (
    select s.player_slug, count(p.id)::int as n, (array_agg(p.id))[1] as profile_id, (array_agg(p.username))[1] as username, slot.claimed_by
    from slugs s left join profiles p on p.player_slug = s.player_slug left join player_slots slot on slot.player_slug = s.player_slug
    group by s.player_slug, slot.claimed_by
  )
  select l.player_slug,
    case when l.n = 1 and (l.claimed_by is null or l.claimed_by = l.profile_id) then l.profile_id end,
    case when l.n = 1 and (l.claimed_by is null or l.claimed_by = l.profile_id) then l.username end,
    case
      when l.n = 0 and l.claimed_by is null then 'unmapped: no profile is linked to this player yet'
      when l.n = 0 then 'ambiguous: the player slot is claimed, but no profile carries this player'
      when l.n > 1 then 'ambiguous: more than one profile carries this player'
      when l.claimed_by is not null and l.claimed_by <> l.profile_id then 'ambiguous: the player slot is claimed by a different profile'
    end
  from linked l;
$$;

-- Every historical round as a player_rounds row would hold it, with `problem` set when it can't be imported.
create or replace function public.legacy_round_candidates()
returns table (player_slug text, source_key text, priority integer, date_played date, course_name text, tee_name text, tee_rating numeric,
  tee_slope integer, holes jsonb, holes_played integer, total integer, format text, source_label text, provenance jsonb,
  counts_for_handicap boolean, not_counted_reason text, differential numeric, problem text)
language sql stable security definer set search_path = public as $$
  with raw as (
    -- 1. Logged rounds (the player's own, with the rating / slope they played).
    select r.player_slug, 'legacy:handicap:' || r.id as source_key, 1 as priority, r.date_played,
      coalesce(nullif(trim(c.name), ''), 'Unknown course') as course_name, r.tee_set_name as tee_name, r.rating, r.slope,
      coalesce(h.holes, '[]'::jsonb) as holes, coalesce(h.n, 0) as hole_count, h.first_hole, h.last_hole,
      coalesce(h.total, r.total_score) as total, 'Stroke Play' as format, 'Logged round' as source_label,
      jsonb_build_object('system', 'handicap_rounds', 'recordId', r.id, 'playerSlug', r.player_slug, 'liveCourseId', r.course_id,
        'teeSetId', r.tee_set_id, 'storedTotal', r.total_score, 'storedDifferential', r.differential) as provenance,
      false as mixed_tee,
      case when h.n > 0 and h.total <> r.total_score then 'the stored total doesn''t match its hole scores' end as source_problem
    from handicap_rounds r
    left join live_courses c on c.id = r.course_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('number', x.hole, 'par', x.par, 'strokes', x.score, 'putts', x.putts,
          'fairway', case when x.fir = '1' then 'center' end, 'green', case when x.gir then 'center' end) order by x.hole) as holes,
        count(*)::int as n, sum(x.score)::int as total, min(x.hole) as first_hole, max(x.hole) as last_hole
      from handicap_round_holes x where x.round_id = r.id and x.score > 0) h on true

    union all
    -- 2. 2024–2026 Maroon Tournament cards.
    select a.player_slug, 'legacy:maroon:' || y.season || ':r' || a.round, 2, coalesce(s.played_on, a.played_on),
      coalesce(nullif(trim(s.course_name), ''), nullif(trim(a.course), ''), 'Unknown course'), t.tee->>'teeSetName',
      (t.tee->>'rating')::numeric, (t.tee->>'slope')::integer,
      coalesce(h.holes, '[]'::jsonb), coalesce(h.n, 0), h.first_hole, h.last_hole, h.total, coalesce(nullif(trim(a.format), ''), 'Unknown format'),
      y.season || ' Maroon Tournament · Round ' || a.round,
      jsonb_build_object('system', 'archived_scorecard_rounds', 'recordId', a.id, 'playerSlug', a.player_slug, 'tournamentSlug', a.tournament_slug,
        'seasonYear', y.season, 'round', a.round, 'liveCourseId', t.tee->>'courseId', 'teeSetId', t.tee->>'teeSetId'),
      exists (select 1 from jsonb_each_text(coalesce(t.tee->'holeTeeSetIds', '{}'::jsonb)) e where e.value <> t.tee->>'teeSetId'),
      case when y.season is null then 'the tournament has no season year' end
    from archived_scorecard_rounds a
    cross join lateral (select substring(a.tournament_slug from '^([0-9]{4})-')::integer as season) y
    left join round_format_setups s on s.season_year = y.season and s.round = a.round
    cross join lateral (select coalesce(s.tee_setup, a.handicap_setup) as tee) t
    left join lateral (
      select jsonb_agg(jsonb_build_object('number', x.hole, 'par', x.par, 'strokes', x.score, 'putts', x.putts,
          'fairway', case when x.fir = '1' then 'center' end, 'green', case when x.gir then 'center' end) order by x.hole) as holes,
        count(*)::int as n, sum(x.score)::int as total, min(x.hole) as first_hole, max(x.hole) as last_hole
      from archived_scorecard_holes x where x.round_id = a.id and x.score > 0) h on true

    union all
    -- 3. 2027+ Maroon Tournament cards (official ones only; pickups aren't completed holes).
    select c.player_slug, 'legacy:maroon:' || c.season_year || ':r' || c.round, 3, coalesce(s.played_on, c.played_on),
      coalesce(nullif(trim(s.course_name), ''), nullif(trim(c.course), ''), 'Unknown course'), t.tee->>'teeSetName',
      (t.tee->>'rating')::numeric, (t.tee->>'slope')::integer,
      coalesce(h.holes, '[]'::jsonb), coalesce(h.n, 0), h.first_hole, h.last_hole, h.total, coalesce(nullif(trim(c.format), ''), 'Unknown format'),
      c.season_year || ' Maroon Tournament · Round ' || c.round,
      jsonb_build_object('system', 'career_archive_rounds', 'playerSlug', c.player_slug, 'seasonYear', c.season_year, 'round', c.round,
        'liveCourseId', t.tee->>'courseId', 'teeSetId', t.tee->>'teeSetId'),
      exists (select 1 from jsonb_each_text(coalesce(t.tee->'holeTeeSetIds', '{}'::jsonb)) e where e.value <> t.tee->>'teeSetId'),
      case when c.status not in ('submitted', 'final') then 'not an official round yet (' || c.status || ')' end
    from career_archive_rounds c
    left join round_format_setups s on s.season_year = c.season_year and s.round = c.round
    cross join lateral (select coalesce(s.tee_setup, c.handicap_setup) as tee) t
    left join lateral (
      select jsonb_agg(jsonb_build_object('number', x.hole, 'strokes', x.score, 'putts', x.putts,
          'fairway', case when x.fir then 'center' end, 'green', case when x.gir then 'center' end) order by x.hole) as holes,
        count(*)::int as n, sum(x.score)::int as total, min(x.hole) as first_hole, max(x.hole) as last_hole
      from career_archive_live_holes x where x.season_year = c.season_year and x.round = c.round and x.player_slug = c.player_slug
        and x.score > 0 and not x.did_not_finish) h on true
    where c.season_year <> 2034
  ), shaped as (
    select r.*,
      case when r.hole_count = 18 then 18
           when r.hole_count = 9 and (r.last_hole <= 9 or r.first_hole >= 10) then 9
           when r.hole_count = 0 and r.source_key like 'legacy:handicap:%' then 18 end as holes_played,
      case when r.rating between 20 and 90 then r.rating end as ok_rating,
      case when r.slope between 55 and 155 then r.slope end as ok_slope
    from raw r
  ), checked as (
    select s.*,
      coalesce(s.source_problem,
        case when s.date_played is null then 'no date played'
             when s.holes_played is null then 'incomplete card (' || s.hole_count || ' holes scored)'
             when s.total is null or s.total not between 18 and 200 then 'the total is missing or out of range'
             when exists (select 1 from jsonb_array_elements(s.holes) e where (e->>'strokes')::int > 20) then 'a hole has more than 20 strokes' end) as problem,
      case
        when not legacy_own_ball_format(s.format) then s.format || ' isn''t an own ball format'
        when s.holes_played <> 18 then '9-hole rounds will count once 9-hole scoring is added'
        when jsonb_array_length(s.holes) <> 18 then 'No hole-by-hole card'
        when s.ok_rating is null or s.ok_slope is null then 'No course rating for this tee'
        when s.mixed_tee then 'Mixed tees need a verified composite rating'
      end as reason
    from shaped s
  )
  select c.player_slug, c.source_key, c.priority, c.date_played, left(c.course_name, 200), left(c.tee_name, 60),
    case when c.tee_name is not null then c.ok_rating end, case when c.tee_name is not null then c.ok_slope end,
    c.holes, c.holes_played, c.total, left(c.format, 60), left(c.source_label, 120), c.provenance,
    c.reason is null and c.tee_name is not null,
    case when c.reason is null and c.tee_name is not null then null else coalesce(c.reason, 'No course rating for this tee') end,
    case when c.reason is null and c.tee_name is not null then round((c.total - c.ok_rating) * 113 / c.ok_slope, 1) end,
    c.problem
  from checked c;
$$;

-- The import (or, with p_dry_run, the same report without writing). Returns:
--   { dryRun, players: [{ playerSlug, username, mapped, problem }], counts: { candidates, imported | wouldImport,
--     alreadyImported, skipped, duplicates }, skipped: [{ playerSlug, sourceKey, reason }] }
create or replace function public.import_legacy_rounds(p_dry_run boolean default true, p_player_slug text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_report jsonb;
  v_written integer := 0;
begin
  create temporary table legacy_import_plan on commit drop as
  with m as (select * from legacy_player_mapping() where p_player_slug is null or player_slug = p_player_slug),
  c as (select * from legacy_round_candidates() where p_player_slug is null or player_slug = p_player_slug),
  ranked as (
    select c.*, m.profile_id, m.problem as player_problem,
      row_number() over (partition by c.player_slug, c.source_key order by c.priority) as copy
    from c left join m on m.player_slug = c.player_slug
  )
  select r.*, case
      when r.copy > 1 then 'duplicate: the same round is already in an earlier source'
      when r.profile_id is null then coalesce(r.player_problem, 'unmapped: no profile is linked to this player yet')
      when r.problem is not null then r.problem
      when exists (select 1 from player_rounds x where x.profile_id = r.profile_id and x.source_key = r.source_key) then 'already imported'
    end as outcome
  from ranked r;

  if not p_dry_run then
    insert into player_rounds (profile_id, source, source_key, source_label, date_played, course_ref, course_name, course_place,
      tee_name, tee_rating, tee_slope, holes_played, format, holes, total, counts_for_handicap, not_counted_reason, differential,
      entered_by, provenance, imported_at)
    select profile_id, 'legacy', source_key, source_label, date_played, null, course_name, '',
      tee_name, tee_rating, tee_slope, holes_played, format, holes, total, counts_for_handicap, not_counted_reason, differential,
      'player', provenance, now()
    from legacy_import_plan where outcome is null
    on conflict (profile_id, source_key) do nothing;
    get diagnostics v_written = row_count;
  end if;

  select jsonb_build_object(
    'dryRun', p_dry_run,
    'players', coalesce((select jsonb_agg(jsonb_build_object('playerSlug', m.player_slug, 'username', m.username, 'mapped', m.profile_id is not null, 'problem', m.problem)
        order by m.player_slug) from legacy_player_mapping() m where p_player_slug is null or m.player_slug = p_player_slug), '[]'::jsonb),
    'counts', jsonb_build_object(
      'candidates', (select count(*) from legacy_import_plan),
      case when p_dry_run then 'wouldImport' else 'imported' end, case when p_dry_run then (select count(*) from legacy_import_plan where outcome is null) else v_written end,
      'alreadyImported', (select count(*) from legacy_import_plan where outcome = 'already imported'),
      'duplicates', (select count(*) from legacy_import_plan where outcome like 'duplicate:%'),
      'skipped', (select count(*) from legacy_import_plan where outcome is not null and outcome <> 'already imported' and outcome not like 'duplicate:%'),
      'countsForHandicap', (select count(*) from legacy_import_plan where outcome is null and counts_for_handicap)),
    'skipped', coalesce((select jsonb_agg(jsonb_build_object('playerSlug', player_slug, 'sourceKey', source_key, 'reason', outcome) order by player_slug, source_key)
        from legacy_import_plan where outcome is not null and outcome <> 'already imported'), '[]'::jsonb)
  ) into v_report;
  drop table legacy_import_plan;
  return v_report;
end;
$$;

revoke all on function public.legacy_own_ball_format(text) from public, anon, authenticated;
revoke all on function public.legacy_player_mapping() from public, anon, authenticated;
revoke all on function public.legacy_round_candidates() from public, anon, authenticated;
revoke all on function public.import_legacy_rounds(boolean, text) from public, anon, authenticated;
grant execute on function public.import_legacy_rounds(boolean, text) to service_role;

commit;
