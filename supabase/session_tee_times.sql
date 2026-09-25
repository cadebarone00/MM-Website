-- supabase/session_tee_times.sql
-- Adds the 3 per-session match tee-time slots (Match 1/2/3, or Match 1&2 /
-- 3&4 / 5&6 for Singles) to live_round_state. Entered and interpreted by
-- the app as Pacific Time. Run once in the Supabase SQL Editor.
alter table live_round_state
  add column if not exists match_tee_times jsonb not null default '[null, null, null]'::jsonb;
