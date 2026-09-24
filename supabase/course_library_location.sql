-- Run once in Supabase after course_library_tee_setups.sql.
-- Optional location fields for a course. City/state are shown to players
-- (e.g. "The Colony, TX"); zip is stored for a future "nearby courses"
-- lookup and is never displayed.
alter table live_courses add column if not exists city text;
alter table live_courses add column if not exists state text;
alter table live_courses add column if not exists zip_code text;

comment on column live_courses.city is 'Display-only, e.g. "The Colony". Optional.';
comment on column live_courses.state is 'Two-letter US state code, e.g. "TX". Optional.';
comment on column live_courses.zip_code is 'Optional. Reserved for a future nearby-courses lookup; never shown in the UI.';
