-- Run once in Supabase after player_slots_email.sql.
-- For a dynamically-added player (no lib/data/players/*.ts file), this
-- IS their name. For one of the 13 hand-written players, null means
-- "use the hand-written file's fullName" (the default, unchanged
-- behavior); a value here overrides it going forward — see the design
-- spec for exactly which pages honor the override.
alter table player_slots add column if not exists full_name text;

comment on column player_slots.full_name is 'Visible display name. Overrides the hand-written PlayerProfile.fullName when set; required for a player with no hand-written file.';
