-- supabase/golf_trip_scoring_realtime.sql
-- Player & Attest Step 3: live sync. Adds the scoring tables to Supabase Realtime so a golfer's phone hears about
-- their attester's entries without refreshing. Realtime only tells the phone "something changed" (rows are still
-- filtered by the read policies in golf_trip_scoring.sql: only people who can see the group get its events); the app
-- then reloads the round through the server, so authorization stays in the database functions.
--
-- Prerequisite: golf_trip_scoring.sql. Safe to run more than once (adds each table only if it isn't already in).
-- Undo: alter publication supabase_realtime drop table public.hole_score_entries, public.scoring_group_players;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hole_score_entries') then
      alter publication supabase_realtime add table public.hole_score_entries;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scoring_group_players') then
      alter publication supabase_realtime add table public.scoring_group_players;
    end if;
  end if;
end $$;
