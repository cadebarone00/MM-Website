-- Run once in the Supabase SQL Editor. This is the live extension of the
-- Career Archive: matchups create the round shells; a trigger mirrors every
-- player score/stat edit into its canonical archived hole row.

create table if not exists career_archive_rounds (
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  player_slug text not null references player_slots(player_slug),
  course text not null,
  played_on date,
  format text not null,
  match_box_id uuid references live_match_boxes(id) on delete set null,
  partner_slug text references player_slots(player_slug),
  opponent_slugs text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  holes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_year, round, player_slug)
);

create table if not exists career_archive_live_holes (
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  player_slug text not null references player_slots(player_slug),
  hole integer not null check (hole between 1 and 18),
  score integer,
  putts integer,
  fir boolean,
  gir boolean,
  updated_at timestamptz not null default now(),
  primary key (season_year, round, player_slug, hole),
  foreign key (season_year, round, player_slug) references career_archive_rounds(season_year, round, player_slug) on delete cascade
);

alter table career_archive_rounds enable row level security;
alter table career_archive_live_holes enable row level security;
create policy career_archive_rounds_select_all on career_archive_rounds for select using (true);
create policy career_archive_live_holes_select_all on career_archive_live_holes for select using (true);

create or replace function mirror_live_score_to_career_archive() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into career_archive_live_holes (season_year, round, player_slug, hole, score, putts, fir, gir, updated_at)
  values (new.season_year, new.round, new.player_slug, new.hole, new.score, new.putts, new.fir, new.gir, now())
  on conflict (season_year, round, player_slug, hole) do update set score = excluded.score, putts = excluded.putts, fir = excluded.fir, gir = excluded.gir, updated_at = now();
  update career_archive_rounds set status = 'live', updated_at = now() where season_year = new.season_year and round = new.round and player_slug = new.player_slug;
  return new;
end;
$$;
drop trigger if exists mirror_live_score_to_career_archive_trigger on live_hole_scores;
create trigger mirror_live_score_to_career_archive_trigger after insert or update on live_hole_scores for each row execute function mirror_live_score_to_career_archive();
