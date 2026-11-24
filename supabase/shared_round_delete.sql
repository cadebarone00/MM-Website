-- supabase/shared_round_delete.sql
-- Play a round → Cancel round → Delete round (project_specs.md, "Cancel / leave a round", owner request 2026-11-22).
--   - Only the host (the golfer who started the round) can delete it, and only while it's live. A round the host has
--     submitted (or ended) is over and stays.
--   - Deleting removes the round for everyone: players, invites, every score, guests' scores and game picks all go with it
--     (their tables already delete with the round). Rounds already saved to a profile (player_rounds) are never touched.
--   - A player who isn't the host can Leave round: they drop out (status 'removed', like the host removing them), the
--     scores already in the round stay, and nothing is saved to their profile for it.
--
-- Prerequisites: shared_rounds.sql (shared_round_scorekeeper.sql too, for guests). Safe to run more than once.
-- Undo: drop function public.delete_shared_round(uuid, uuid); drop function public.leave_shared_round(uuid, uuid);

begin;

create or replace function public.delete_shared_round(p_host uuid, p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not shared_round_is_host(p_host, p_round) then raise exception 'Only the host can delete the round.' using errcode = '42501'; end if;
  if exists (select 1 from shared_rounds where id = p_round and status <> 'live') then
    raise exception 'This round is already over, so it can''t be deleted.' using errcode = '22023';
  end if;
  delete from shared_rounds where id = p_round;
end $$;

create or replace function public.leave_shared_round(p_profile uuid, p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if shared_round_is_host(p_profile, p_round) then raise exception 'The host cancels the round instead of leaving it.' using errcode = '22023'; end if;
  update shared_round_players set status = 'removed'
  where round_id = p_round and profile_id = p_profile and status in ('invited', 'joined')
    and exists (select 1 from shared_rounds where id = p_round and status = 'live');
  if not found then raise exception 'You''re not in a live round to leave.' using errcode = '22023'; end if;
end $$;

revoke all on function public.delete_shared_round(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_shared_round(uuid, uuid) to service_role;
revoke all on function public.leave_shared_round(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_shared_round(uuid, uuid) to service_role;

commit;
