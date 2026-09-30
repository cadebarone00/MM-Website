-- supabase/platform_foundation_rollback.sql
-- Undoes supabase/platform_foundation.sql: drops the platform tables and
-- profiles.platform_role. No existing tournament data lives in these tables
-- (they were seeded FROM it), so nothing of The Maroon's is lost.
-- Run supabase/platform_editions_rollback.sql first if C2 was applied.
-- Safe to run more than once.

begin;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_legacy_edition_id') then
    raise exception 'Run supabase/platform_editions_rollback.sql first.';
  end if;
end $$;

drop table if exists public.edition_settings;
drop table if exists public.edition_roster;
drop table if exists public.edition_teams;
drop table if exists public.tournament_players;
drop table if exists public.tournament_members;
drop table if exists public.tournament_editions;
drop table if exists public.tournaments;
drop table if exists public.organizations;
drop table if exists public.platform_plans;
drop table if exists public.tournament_creator_access;
drop table if exists public.platform_settings;
alter table public.profiles drop constraint if exists profiles_platform_role_check;
alter table public.profiles drop column if exists platform_role;

commit;
