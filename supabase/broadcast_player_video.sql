-- Run once after schema.sql. Player-shot videos become an ordered broadcast
-- queue: every viewer sees the same four-second transition and same clip.
alter table broadcast_state add column if not exists video_phase text
  check (video_phase in ('transition', 'playing'));
alter table broadcast_state add column if not exists active_video_queue_id uuid;
alter table broadcast_state add column if not exists video_phase_started_at timestamptz;

create table if not exists broadcast_player_video_queue (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2024 and 2034),
  video_id uuid not null references archived_shot_videos(id) on delete cascade,
  tournament_slug text not null,
  player_slug text not null references player_slots(player_slug) on delete cascade,
  player_name text not null,
  round integer not null check (round > 0),
  hole integer not null check (hole between 1 and 18),
  shot_number integer not null check (shot_number > 0),
  par integer not null check (par between 3 and 6),
  yards integer not null check (yards > 0),
  score_to_par integer,
  video_url text not null,
  status text not null default 'queued' check (status in ('queued', 'transition', 'playing', 'played', 'dismissed')),
  queued_at timestamptz not null default now(),
  played_at timestamptz,
  unique (video_id)
);
create index if not exists broadcast_player_video_queue_next_idx
  on broadcast_player_video_queue (season_year, status, queued_at);

alter table broadcast_state drop constraint if exists broadcast_state_active_video_queue_id_fkey;
alter table broadcast_state add constraint broadcast_state_active_video_queue_id_fkey
  foreign key (active_video_queue_id) references broadcast_player_video_queue(id) on delete set null;

alter table broadcast_player_video_queue enable row level security;
drop policy if exists broadcast_player_video_queue_select_all on broadcast_player_video_queue;
create policy broadcast_player_video_queue_select_all on broadcast_player_video_queue for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_player_video_queue'
  ) then
    alter publication supabase_realtime add table broadcast_player_video_queue;
  end if;
end $$;
