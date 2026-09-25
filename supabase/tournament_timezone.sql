-- supabase/tournament_timezone.sql
-- Adds the tournament year's venue timezone (an IANA zone id, e.g.
-- "America/Los_Angeles") to live_tournament_settings. Tee times for that
-- year are entered and shown venue-local in Tiger's admin tools using this
-- zone; every other display on the site shows the viewer's own local time
-- instead. Defaults to Pacific so the already-in-progress 2027 season (a
-- real California venue) needs no action. Run once in the Supabase SQL
-- Editor.
alter table live_tournament_settings
  add column if not exists timezone text not null default 'America/Los_Angeles';
