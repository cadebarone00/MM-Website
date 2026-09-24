-- Run once in Supabase after hole_shot_directions.sql. Adds "penalty" as a
-- valid gir_direction value — a missed green because of a penalty stroke or
-- lost ball, not a directional miss. Fairway direction is untouched; penalty
-- is GIR-only. Postgres names an unnamed inline check constraint
-- "<table>_<column>_check" by default, which is what the original
-- hole_shot_directions.sql migration left behind — this drops and replaces
-- just that constraint, the column itself already exists.
alter table handicap_round_holes drop constraint if exists handicap_round_holes_gir_direction_check;
alter table handicap_round_holes add constraint handicap_round_holes_gir_direction_check check (gir_direction in ('left', 'right', 'short', 'long', 'penalty'));
alter table live_hole_scores drop constraint if exists live_hole_scores_gir_direction_check;
alter table live_hole_scores add constraint live_hole_scores_gir_direction_check check (gir_direction in ('left', 'right', 'short', 'long', 'penalty'));
