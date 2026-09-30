-- Shared display settings. Tournament records remain in their existing season tables.
begin;
create table if not exists public.website_section_settings (
  section text primary key check (section in ('home', 'home_results', 'home_schedule', 'home_teams', 'leaderboard', 'teams', 'schedule', 'portal')),
  season_year integer check (season_year between 2024 and 2033),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.website_section_settings enable row level security;
revoke all on public.website_section_settings from anon, authenticated;
grant all on public.website_section_settings to service_role;
-- All reads and writes are server-side; mutations require the existing Admin host guard.
commit;
