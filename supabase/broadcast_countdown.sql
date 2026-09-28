-- Independent Watch Live holding-screen event, shared across broadcast display years.
begin;
create table if not exists public.broadcast_countdown (
  id boolean primary key default true check (id),
  title text not null check (length(trim(title)) between 1 and 120),
  event_date date not null,
  event_time time not null,
  timezone text not null,
  target_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.broadcast_countdown enable row level security;
revoke all on public.broadcast_countdown from anon, authenticated;
grant all on public.broadcast_countdown to service_role;
-- Public API exposes only the countdown; writes require requireHost().
commit;
