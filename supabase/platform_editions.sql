-- supabase/platform_editions.sql
-- Multi-tenant platform, Phase C step 2 (THE_MAROON_PRODUCT_SPEC.md §6.2).
--
-- Adds a nullable edition_id to every table that is keyed by season_year,
-- fills it in for The Maroon Tournament, and keeps it filled in for every
-- future write, so existing code that only knows season_year keeps working
-- unchanged. Nothing is renamed, no key changes, no row values change
-- (other than the new column), and no existing function is replaced.
--
-- Prerequisites: platform_foundation.sql has been run.
-- Before running in production, follow docs/production-migration-checklist.md.
-- Undo: supabase/platform_editions_rollback.sql.
-- Safe to run more than once.

begin;

do $$
begin
  if to_regclass('public.tournament_editions') is null then
    raise exception 'Run supabase/platform_foundation.sql first.';
  end if;
end $$;

-- Lets a child row's (edition_id, season_year) pair be checked against the
-- edition itself: the two can never disagree.
-- (Added only if missing: on a re-run, the child foreign keys depend on it.)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_editions_id_season_year_key') then
    alter table public.tournament_editions add constraint tournament_editions_id_season_year_key unique (id, season_year);
  end if;
end $$;

-- Exactly one tournament may run on the legacy year-keyed engine.
create unique index if not exists tournaments_single_legacy_idx on public.tournaments (is_legacy) where is_legacy;

-- The legacy tournament's edition for a year, created on first use so a
-- legacy write never ends up without an edition. An edition row is only a
-- container (label = the year); it invents no tournament data.
create or replace function public.legacy_edition_id(p_year integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_edition uuid;
begin
  if p_year is null then return null; end if;
  select id into v_tournament from tournaments where is_legacy;
  if v_tournament is null then return null; end if;
  select id into v_edition from tournament_editions where tournament_id = v_tournament and season_year = p_year;
  if v_edition is null then
    insert into tournament_editions (tournament_id, season_year, label, status)
    values (v_tournament, p_year, p_year::text, 'draft')
    on conflict (tournament_id, season_year) do nothing;
    select id into v_edition from tournament_editions where tournament_id = v_tournament and season_year = p_year;
  end if;
  return v_edition;
end;
$$;
revoke all on function public.legacy_edition_id(integer) from public, anon, authenticated;

-- Fills edition_id for writers that only set season_year (all existing
-- code). If a writer changes season_year without choosing a new edition,
-- the edition follows the year.
create or replace function public.set_legacy_edition_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.season_year is distinct from old.season_year and new.edition_id is not distinct from old.edition_id then
    new.edition_id := null;
  end if;
  if new.edition_id is null then
    new.edition_id := legacy_edition_id(new.season_year);
  end if;
  return new;
end;
$$;

-- Every table keyed by season_year (verified against the full migration
-- chain on 2026-09-29).
do $$
declare
  v_table text;
  v_trigger record;
  v_tables text[] := array[
    'broadcast_config', 'broadcast_display_year', 'broadcast_events', 'broadcast_player_video_queue',
    'broadcast_playlist_tracks', 'broadcast_state', 'career_archive_live_holes', 'career_archive_rounds',
    'career_archive_team_holes', 'live_active_season', 'live_hole_scores', 'live_match_boxes',
    'live_match_odds_snapshots', 'live_match_official_state', 'live_publication_jobs', 'live_roster',
    'live_roster_assignment_locks', 'live_round_state', 'live_score_audit_events', 'live_tournament_settings',
    'low_individual_odds_snapshots', 'player_birdies_odds_snapshots', 'player_doubles_odds_snapshots',
    'round_format_setups', 'season_calendar', 'team_winner_odds_snapshots', 'team_winner_pair_odds',
    'team_winner_pricing_lease', 'total_birdies_odds_snapshots', 'website_section_settings'
  ];
  v_disabled text[] := '{}';
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise notice 'Skipping %: table does not exist in this database.', v_table;
      continue;
    end if;

    execute format('alter table public.%I add column if not exists edition_id uuid', v_table);
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_table || '_edition_fkey');
    execute format('alter table public.%I add constraint %I foreign key (edition_id, season_year) references public.tournament_editions (id, season_year)',
      v_table, v_table || '_edition_fkey');
    execute format('create index if not exists %I on public.%I (edition_id)', v_table || '_edition_idx', v_table);

    -- The backfill below must not look like a real edit: the existing
    -- triggers would re-publish matches, rewrite the career archive, and
    -- re-run wager settlement. Switch off only the triggers that are on
    -- right now, so the same set is switched back on afterwards.
    for v_trigger in
      select tgname from pg_trigger
      where tgrelid = ('public.' || v_table)::regclass and not tgisinternal and tgenabled <> 'D'
        and tgname <> 'set_edition_id'
    loop
      execute format('alter table public.%I disable trigger %I', v_table, v_trigger.tgname);
      v_disabled := v_disabled || array[v_table || '.' || v_trigger.tgname];
    end loop;
    execute format('drop trigger if exists set_edition_id on public.%I', v_table);

    execute format('update public.%I set edition_id = public.legacy_edition_id(season_year) where edition_id is null and season_year is not null', v_table);

    execute format('create trigger set_edition_id before insert or update on public.%I for each row execute function public.set_legacy_edition_id()', v_table);
  end loop;

  -- Same transaction: if anything above failed, none of this happened.
  foreach v_table in array v_disabled loop
    execute format('alter table public.%I enable trigger %I', split_part(v_table, '.', 1), split_part(v_table, '.', 2));
  end loop;
end $$;

commit;
