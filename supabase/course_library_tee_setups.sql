-- Run once in Supabase after live_match_publication.sql.
-- A course is global. A tee set is a named 18-hole yardage/rating/slope
-- configuration within that course. A round snapshots its selected tee set
-- plus any hole-by-hole override, so “Palmer” never becomes Palmer 1/2/3.
-- Older projects may have the original live_courses shape without these
-- optional rating fields, so make this migration self-contained.
alter table live_courses add column if not exists rating numeric;
alter table live_courses add column if not exists slope integer check (slope between 55 and 155);
alter table live_courses add column if not exists tee_sets jsonb not null default '[]'::jsonb;
alter table live_round_state add column if not exists course_setup jsonb;

-- Turn every pre-existing course row into a first editable tee set.
update live_courses
set tee_sets = jsonb_build_array(jsonb_build_object(
  'id', 'standard',
  'name', 'Standard',
  'holes', holes,
  'rating', rating,
  'slope', slope
))
where tee_sets = '[]'::jsonb;

comment on column live_courses.tee_sets is 'Named tee configurations with 18 hole par/yardage values and rating/slope.';
comment on column live_round_state.course_setup is 'Immutable round setup: selected tee set plus hole-by-hole tee overrides.';
