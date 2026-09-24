-- Run once in Supabase after schema.sql.
-- Remembers the email address Tiger last sent a player's invite to, so
-- "Send Invite" can pre-fill it instead of asking again on a resend.
-- Same RLS posture as the rest of player_slots (no policies — only the
-- service-role key ever reads/writes it).
alter table player_slots add column if not exists email text;

comment on column player_slots.email is 'Address Tiger sent the invite to. Optional — null until a first invite is sent.';
