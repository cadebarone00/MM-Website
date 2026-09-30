-- supabase/platform_foundation.sql
-- Multi-tenant platform, Phase C step 1 (see THE_MAROON_PRODUCT_SPEC.md §6.1).
--
-- Purely additive: creates the organization / tournament / edition layer and
-- seeds The Maroon Tournament as the first tenant. No existing table changes
-- shape except one new nullable column (profiles.platform_role), and no
-- existing code reads these tables yet. Safe to run more than once.
--
-- Run once in the Supabase SQL Editor AFTER schema.sql and the later one-off
-- files (it reads player_slots.full_name and live_tournament_settings.venue_name).

begin;

-- === Plans (monetization-ready, no prices) =================================
-- Prices live in the payment provider later; this table only says what a
-- plan unlocks. 'founder' = The Maroon (everything); 'beta' = invited beta
-- tournaments (everything needed to create, run and test a tournament, but
-- never wagers/fantasy, and no hosted media uploads: commercial V1 media is
-- none, on-device, or external links). Paid limits are decided after beta (spec §14).
create table if not exists public.platform_plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null,
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.platform_plans (key, name, entitlements) values
  ('founder', 'Founder', jsonb_build_object(
    'max_players', null, 'custom_branding', true, 'broadcast', true,
    'wagers', true, 'fantasy', true, 'custom_domain', true, 'hosted_media', true)),
  ('beta', 'Beta Tournament', jsonb_build_object(
    'max_players', null, 'custom_branding', true, 'broadcast', false,
    'wagers', false, 'fantasy', false, 'custom_domain', false, 'hosted_media', false))
on conflict (key) do nothing;

-- === Who may create tournaments =============================================
-- V1 is invite-only: a platform admin approves each creator. Flipping
-- tournament_creation to 'self_serve' opens it to every signed-in user
-- without any other change (lib/platform/entitlements.ts canCreateTournament).
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  tournament_creation text not null default 'invite_only' check (tournament_creation in ('invite_only', 'self_serve')),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.tournament_creator_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'revoked')),
  note text check (note is null or length(note) <= 500),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- === Organizations ==========================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name text not null check (length(trim(name)) between 1 and 120),
  plan_key text not null default 'founder' references public.platform_plans(key),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- === Tournaments (a recurring event/series) =================================
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name text not null check (length(trim(name)) between 1 and 80),
  short_name text not null check (length(trim(short_name)) between 1 and 24),
  description text check (description is null or length(description) <= 2000),
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- { primary, secondary, accent (hex), logoUrl, heroImageUrl } — validated
  -- in lib/platform/tournamentConfig.ts before it is ever written.
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  -- The founding tournament still runs on the year-keyed live_* tables and
  -- static lib/data files; true until its migration (spec §16) completes.
  is_legacy boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tournaments_organization_idx on public.tournaments (organization_id);

-- === Editions (one playing of a tournament) =================================
create table if not exists public.tournament_editions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  season_year integer not null check (season_year between 2000 and 2200),
  label text not null check (length(trim(label)) between 1 and 80),
  destination text,
  start_date date,
  end_date date,
  timezone text not null default 'America/Chicago',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'completed', 'archived')),
  is_test boolean not null default false,
  -- The existing URL slug for this edition (e.g. '2026-palm-springs'), so
  -- legacy routes can resolve to an edition without a lookup table.
  legacy_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, season_year),
  -- Target of composite foreign keys that pin child rows to one tenant.
  unique (id, tournament_id),
  check (start_date is null or end_date is null or start_date <= end_date)
);
create unique index if not exists tournament_editions_legacy_slug_idx
  on public.tournament_editions (tournament_id, legacy_slug) where legacy_slug is not null;

-- === Members & roles ========================================================
alter table public.profiles add column if not exists platform_role text;
alter table public.profiles drop constraint if exists profiles_platform_role_check;
alter table public.profiles add constraint profiles_platform_role_check check (platform_role is null or platform_role = 'admin');

create table if not exists public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'organizer', 'player', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (tournament_id, profile_id)
);
create index if not exists tournament_members_profile_idx on public.tournament_members (profile_id);

-- === Players ================================================================
-- A golfer as one tournament knows them; persists across that tournament's
-- editions. profile_id links to the user's login once they claim it.
create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  photo_url text,
  profile_id uuid references public.profiles(id) on delete set null,
  -- Bridge to the existing engine, which identifies players by player_slug.
  legacy_player_slug text references public.player_slots(player_slug) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tournament_id),
  unique (tournament_id, legacy_player_slug)
);

-- === Teams (per edition — rosters and names can change year to year) ========
create table if not exists public.edition_teams (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.tournament_editions(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(key) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 40),
  short_name text check (short_name is null or length(trim(short_name)) between 1 and 12),
  color text not null default '#500001' check (color ~* '^#[0-9a-f]{6}$'),
  logo_url text,
  captain_player_id uuid references public.tournament_players(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (edition_id, key),
  unique (id, edition_id)
);

-- === Roster (who plays in an edition, and for which team) ===================
-- The composite foreign keys are the tenant-isolation guarantee: a roster
-- row cannot point at a player from another tournament or a team from
-- another edition, no matter what the application sends.
create table if not exists public.edition_roster (
  edition_id uuid not null,
  tournament_id uuid not null,
  tournament_player_id uuid not null,
  team_id uuid,
  handicap numeric(4,1) check (handicap is null or handicap between -10 and 54),
  created_at timestamptz not null default now(),
  primary key (edition_id, tournament_player_id),
  foreign key (edition_id, tournament_id) references public.tournament_editions(id, tournament_id) on delete cascade,
  foreign key (tournament_player_id, tournament_id) references public.tournament_players(id, tournament_id) on delete cascade,
  foreign key (team_id, edition_id) references public.edition_teams(id, edition_id)
);
create index if not exists edition_roster_team_idx on public.edition_roster (team_id);

-- === Edition settings (scoring rules, site visibility) ======================
create table if not exists public.edition_settings (
  edition_id uuid primary key references public.tournament_editions(id) on delete cascade,
  scoring jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring) = 'object'),
  site jsonb not null default '{}'::jsonb check (jsonb_typeof(site) = 'object'),
  updated_at timestamptz not null default now()
);
-- Setup decisions made before players/courses exist: competition type,
-- planned headcount, planned rounds and their formats (null = TBD).
alter table public.edition_settings add column if not exists plan jsonb not null default '{}'::jsonb;
alter table public.edition_settings drop constraint if exists edition_settings_plan_check;
alter table public.edition_settings add constraint edition_settings_plan_check check (jsonb_typeof(plan) = 'object');

-- === Access: service role only (same pattern as player_slots) ===============
-- All reads and writes go through server routes that check membership in
-- code; no anon/authenticated policies are defined on purpose.
alter table public.platform_plans enable row level security;
alter table public.organizations enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_editions enable row level security;
alter table public.tournament_members enable row level security;
alter table public.tournament_players enable row level security;
alter table public.edition_teams enable row level security;
alter table public.edition_roster enable row level security;
alter table public.edition_settings enable row level security;
alter table public.platform_settings enable row level security;
alter table public.tournament_creator_access enable row level security;
revoke all on public.platform_plans, public.organizations, public.tournaments, public.tournament_editions,
  public.tournament_members, public.tournament_players, public.edition_teams, public.edition_roster,
  public.edition_settings, public.platform_settings, public.tournament_creator_access from anon, authenticated;
grant all on public.platform_plans, public.organizations, public.tournaments, public.tournament_editions,
  public.tournament_members, public.tournament_players, public.edition_teams, public.edition_roster,
  public.edition_settings, public.platform_settings, public.tournament_creator_access to service_role;

-- === Seed: The Maroon Tournament as tenant #1 ===============================
insert into public.organizations (slug, name, plan_key)
values ('the-maroon', 'The Maroon', 'founder')
on conflict (slug) do nothing;

insert into public.tournaments (organization_id, slug, name, short_name, visibility, status, branding, is_legacy)
select id, 'the-maroon-tournament', 'The Maroon Tournament', 'The Maroon', 'public', 'active',
  jsonb_build_object('primary', '#500001', 'secondary', '#fbf8f1', 'accent', '#b8945a'), true
from public.organizations where slug = 'the-maroon'
on conflict (slug) do nothing;

-- Every year the existing system can address (2024-2034). Past editions use
-- the facts already in lib/data/*.ts; live years use live_tournament_settings
-- when a row exists. 2034 keeps its existing role as the test season.
insert into public.tournament_editions
  (tournament_id, season_year, label, destination, start_date, end_date, timezone, status, is_test, legacy_slug)
select t.id, y.season_year,
  case when y.season_year = 2034 then 'Test Season' else y.season_year::text end,
  coalesce(s.venue_name, past.destination),
  coalesce(s.begin_date, past.start_date),
  coalesce(s.end_date, past.end_date),
  coalesce(s.timezone, past.timezone, 'America/Los_Angeles'),
  case when y.season_year < 2027 then 'completed' when y.season_year = 2027 then 'scheduled' else 'draft' end,
  y.season_year = 2034,
  coalesce(past.legacy_slug, case when y.season_year = 2027 then '2027' end)
from public.tournaments t
cross join generate_series(2024, 2034) as y(season_year)
left join public.live_tournament_settings s on s.season_year = y.season_year
left join (values
  (2024, 'Pinehurst', date '2024-01-09', date '2024-01-12', 'America/New_York', '2024-pinehurst'),
  (2025, 'Danzante Bay', date '2025-01-07', date '2025-01-12', 'America/Mazatlan', '2025-danzante'),
  (2026, 'Mission Hills CC', date '2026-01-07', date '2026-01-10', 'America/Los_Angeles', '2026-palm-springs')
) as past(season_year, destination, start_date, end_date, timezone, legacy_slug) on past.season_year = y.season_year
where t.slug = 'the-maroon-tournament'
on conflict (tournament_id, season_year) do nothing;

insert into public.edition_teams (edition_id, key, name, short_name, color, sort_order)
select e.id, team.key, team.name, team.short_name, team.color, team.sort_order
from public.tournament_editions e
join public.tournaments t on t.id = e.tournament_id and t.slug = 'the-maroon-tournament'
cross join (values
  ('maroon', 'Team Maroon', 'Maroon', '#500001', 0),
  ('white', 'Team White', 'White', '#fbf8f1', 1)
) as team(key, name, short_name, color, sort_order)
on conflict (edition_id, key) do nothing;

-- One tournament player per existing player slot. The display name is only a
-- fallback for the new layer; existing pages keep resolving names from
-- lib/data/players/*.ts until they move over.
insert into public.tournament_players (tournament_id, display_name, email, profile_id, legacy_player_slug)
select t.id,
  coalesce(nullif(trim(slot.full_name), ''), initcap(replace(slot.player_slug, '-', ' '))),
  case when slot.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then slot.email end,
  slot.claimed_by,
  slot.player_slug
from public.player_slots slot
cross join public.tournaments t
where t.slug = 'the-maroon-tournament'
on conflict (tournament_id, legacy_player_slug) do nothing;

-- Live-year rosters that already exist in the database. Past-year rosters
-- live in lib/data/*.ts and are intentionally not copied here (spec §16).
insert into public.edition_roster (edition_id, tournament_id, tournament_player_id, team_id)
select e.id, e.tournament_id, p.id, team.id
from public.live_roster r
join public.tournaments t on t.slug = 'the-maroon-tournament'
join public.tournament_editions e on e.tournament_id = t.id and e.season_year = r.season_year
join public.tournament_players p on p.tournament_id = t.id and p.legacy_player_slug = r.player_slug
join public.edition_teams team on team.edition_id = e.id and team.key = r.team
on conflict (edition_id, tournament_player_id) do nothing;

-- Maroon's current rules: 1 point per match win, 1/2 per halve, gross.
insert into public.edition_settings (edition_id, scoring)
select e.id, jsonb_build_object(
  'mode', 'match_play', 'pointsForWin', 1, 'pointsForHalve', 0.5,
  'handicap', 'gross', 'allowancePercent', 100, 'allowEarlyFinish', true, 'allowConcessions', false)
from public.tournament_editions e
join public.tournaments t on t.id = e.tournament_id and t.slug = 'the-maroon-tournament'
on conflict (edition_id) do nothing;

-- Every current host becomes an owner of The Maroon Tournament. Platform
-- admin is deliberately NOT granted here — set profiles.platform_role by hand.
insert into public.tournament_members (tournament_id, profile_id, role)
select t.id, p.id, 'owner'
from public.profiles p
cross join public.tournaments t
where t.slug = 'the-maroon-tournament' and p.is_host
on conflict (tournament_id, profile_id) do nothing;

commit;
