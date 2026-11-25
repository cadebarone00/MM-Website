-- supabase/golf_trip_predict_books.sql
-- Golf Trip → Predict follows the account (project_specs.md "Predict follows the account", approved 2026-11-25).
-- Requires golf_trips.sql (golf_trips) and profiles. Safe to run more than once.
--
-- One Predict wallet per player per trip: play-only Maroon Coins (no money, no prizes, no cash-out), starting at 1,000.
--   balance     coins left to spend (never below zero)
--   positions   the picks bought: [{ key, outcome, shares, paid }]
--   version     goes up by one on every save, so two phones can't overwrite each other's trades
-- Only the server reads and writes it (route /api/golf-trips/<trip>/predict-book, after checking you're on the trip), so
-- each player only ever sees their own wallet. Deleting a trip or a player deletes their wallet with it.

create table if not exists public.golf_trip_predict_books (
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  balance double precision not null default 1000 check (balance >= 0 and balance <= 1000000),
  positions jsonb not null default '[]'::jsonb check (jsonb_typeof(positions) = 'array' and jsonb_array_length(positions) <= 500),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (golf_trip_id, profile_id)
);

alter table public.golf_trip_predict_books enable row level security;
revoke all on public.golf_trip_predict_books from public, anon, authenticated;
grant all on public.golf_trip_predict_books to service_role;
