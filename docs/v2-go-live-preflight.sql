-- docs/v2-go-live-preflight.sql
-- READ-ONLY. Changes nothing. Run in the PRODUCTION Supabase SQL Editor and send the result table back.
-- One row per database file the V2 sign-up needs (in the order they must be installed), with installed = true / false.
-- Used by docs/v2-go-live-checklist-2026-11-02.md, Step 1.

with fn(name) as (select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
col(tbl, name) as (select table_name, column_name from information_schema.columns where table_schema = 'public'),
idx(name) as (select indexname from pg_indexes where schemaname = 'public')
select ord, file, installed from (values
  (1,  'platform_foundation.sql',        to_regclass('public.tournaments') is not null),
  (2,  'player_slots_email.sql',         exists (select 1 from col where tbl = 'player_slots' and name = 'email')),
  (3,  'player_slots_full_name.sql',     exists (select 1 from col where tbl = 'player_slots' and name = 'full_name')),
  (4,  'tournament_player_identity.sql', exists (select 1 from fn where name = 'keep_tournament_player_profile')),
  (5,  'profile_identity.sql',           exists (select 1 from idx where name = 'profiles_player_slug_key')),
  (6,  'profile_v1.sql',                 exists (select 1 from fn where name = 'profile_username_problem')),
  (7,  'golf_trips.sql',                 to_regclass('public.golf_trips') is not null),
  (8,  'golf_trip_invitations.sql',      exists (select 1 from fn where name = 'golf_trip_invite_hash')),
  (9,  'player_rounds.sql',              to_regclass('public.player_rounds') is not null),
  (10, 'shared_rounds.sql',              to_regclass('public.shared_rounds') is not null),
  (11, 'profile_initialization.sql',     exists (select 1 from fn where name = 'profile_is_complete')),
  (12, 'account_deletion.sql',           to_regclass('public.account_deletions') is not null),
  (13, 'profile_friends.sql',            to_regclass('public.profile_friend_requests') is not null),
  (14, 'profile_read_model.sql',         exists (select 1 from fn where name = 'get_profile_history')),
  (15, 'account_activation.sql',         to_regclass('public.account_birthdates') is not null),
  (16, 'auth_code_attempts.sql',         to_regclass('public.auth_code_attempts') is not null),
  (17, 'signup_gate.sql',                to_regclass('public.signup_allowlist') is not null),
  (99, 'NEVER RUN: account_activation_enforcement.sql (Stage D)', false)
) as t(ord, file, installed)
order by ord;
