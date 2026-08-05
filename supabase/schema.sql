-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query -> paste this whole file -> Run). Safe to run more than once.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  username text not null unique,
  is_host boolean not null default false,
  player_slug text,
  created_at timestamptz not null default now()
);

create table if not exists player_slots (
  player_slug text primary key,
  username text unique,
  claimed_by uuid references profiles(id) on delete set null,
  claimed_at timestamptz
);

-- profiles.player_slug references player_slots, so player_slots must exist
-- first — recreate profiles' FK now that both tables are defined.
alter table profiles
  drop constraint if exists profiles_player_slug_fkey,
  add constraint profiles_player_slug_fkey foreign key (player_slug) references player_slots(player_slug);

-- Case-insensitive uniqueness (plain `unique` above is case-sensitive, so
-- "Kyle" and "kyle" wouldn't otherwise collide).
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));
create unique index if not exists player_slots_username_lower_idx on player_slots (lower(username)) where username is not null;

alter table profiles enable row level security;
alter table player_slots enable row level security;

-- Users may read only their own profile row. Every insert/update to
-- profiles happens server-side with the service-role key (bypasses RLS) —
-- there is deliberately no insert/update policy here.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id);

-- player_slots has NO policies — only the service-role key (which bypasses
-- RLS entirely) may ever touch it. This keeps player usernames and claim
-- status invisible to the anon key.

-- Seed the 13 known players (mirrors lib/data/players/index.ts) with their
-- deterministically computed usernames (see lib/portal/computePlayerUsername.ts).
-- Re-running is safe: existing rows are left untouched.
insert into player_slots (player_slug, username) values
  ('cade-barone', 'MMCADBAR'),
  ('cam-latto', 'MMCAMLAT'),
  ('collin-ross', 'MMCOLROS'),
  ('dalton-spriggs', 'MMDALSPR'),
  ('drew-weisser', 'MMDREWEI'),
  ('hugo-moebel', 'MMHUGMOE'),
  ('jackson-collins', 'MMJACCOL'),
  ('kyle-schnabel', 'MMKYLSCH'),
  ('luke-sherrell', 'MMLUKSHE'),
  ('nate-wojciechowski', 'MMNATWOJ'),
  ('pete-peabody', 'MMPETPEA'),
  ('peyton-vos', 'MMPEYVOS'),
  ('quez-currier', 'MMQUECUR')
on conflict (player_slug) do nothing;
