-- Run once before deploying archived tee assignment.
alter table public.archived_scorecard_rounds add column if not exists handicap_setup jsonb;
alter table public.archived_scorecard_rounds add column if not exists played_on date;
alter table public.career_archive_rounds add column if not exists handicap_setup jsonb;
comment on column public.archived_scorecard_rounds.handicap_setup is 'Verified historical course/tee snapshot, independent of later library edits.';
comment on column public.career_archive_rounds.handicap_setup is 'Tiger locked course setup copied to each player archive before play.';
