-- Run once in Supabase after schema.sql. Adds optional miss-direction
-- tracking alongside the existing fir/gir hit-or-miss columns — purely
-- additive, doesn't change what fir/gir mean or touch the handicap formula.
alter table handicap_round_holes add column if not exists fir_direction text check (fir_direction in ('left', 'right', 'short', 'long'));
alter table handicap_round_holes add column if not exists gir_direction text check (gir_direction in ('left', 'right', 'short', 'long'));
alter table live_hole_scores add column if not exists fir_direction text check (fir_direction in ('left', 'right', 'short', 'long'));
alter table live_hole_scores add column if not exists gir_direction text check (gir_direction in ('left', 'right', 'short', 'long'));

comment on column handicap_round_holes.fir_direction is 'Which way the fairway shot missed, if it missed. Null = hit, or not recorded.';
comment on column handicap_round_holes.gir_direction is 'Which way the approach missed the green, if it missed. Null = hit, or not recorded.';
comment on column live_hole_scores.fir_direction is 'Which way the fairway shot missed, if it missed. Null = hit, or not recorded.';
comment on column live_hole_scores.gir_direction is 'Which way the approach missed the green, if it missed. Null = hit, or not recorded.';
