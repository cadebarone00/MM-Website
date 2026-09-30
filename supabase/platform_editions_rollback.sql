-- supabase/platform_editions_rollback.sql
-- Undoes supabase/platform_editions.sql exactly: removes the edition_id
-- column, its constraint, index and trigger from every table, then the
-- helper functions. No other data is touched. Safe to run more than once.
-- (Editions created on demand by legacy_edition_id stay; they are empty
-- containers and platform_foundation.sql owns that table.)

begin;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'broadcast_config', 'broadcast_display_year', 'broadcast_events', 'broadcast_player_video_queue',
    'broadcast_playlist_tracks', 'broadcast_state', 'career_archive_live_holes', 'career_archive_rounds',
    'career_archive_team_holes', 'live_active_season', 'live_hole_scores', 'live_match_boxes',
    'live_match_odds_snapshots', 'live_match_official_state', 'live_publication_jobs', 'live_roster',
    'live_roster_assignment_locks', 'live_round_state', 'live_score_audit_events', 'live_tournament_settings',
    'low_individual_odds_snapshots', 'player_birdies_odds_snapshots', 'player_doubles_odds_snapshots',
    'round_format_setups', 'season_calendar', 'team_winner_odds_snapshots', 'team_winner_pair_odds',
    'team_winner_pricing_lease', 'total_birdies_odds_snapshots', 'website_section_settings'
  ] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('drop trigger if exists set_edition_id on public.%I', v_table);
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_table || '_edition_fkey');
    execute format('drop index if exists public.%I', v_table || '_edition_idx');
    execute format('alter table public.%I drop column if exists edition_id', v_table);
  end loop;
end $$;

drop function if exists public.set_legacy_edition_id();
drop function if exists public.legacy_edition_id(integer);
drop index if exists public.tournaments_single_legacy_idx;
alter table public.tournament_editions drop constraint if exists tournament_editions_id_season_year_key;

commit;
