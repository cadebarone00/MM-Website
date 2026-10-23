-- supabase/tournament_tee_sheets.sql
-- Tee sheets for tournaments by code: the organizer sets each round's groups (random or hand picked), their tee times
-- and starting holes. A round with none shows automatic foursomes (lib/platform/codeTournaments.ts, roundTeeSheet).
--
-- tee_sheet = { groups: [{ time: "HH:MM", hole, players: [profile id, ...] }] }
--
-- Prerequisite: tournament_codes.sql. Safe to run more than once.
-- Undo: alter table public.code_tournament_rounds drop column tee_sheet; drop function public.set_code_tournament_tee_sheet(uuid, uuid, integer, jsonb);
--       then re-run tournament_codes.sql (get_code_tournament without teeSheet).

begin;

alter table public.code_tournament_rounds add column if not exists tee_sheet jsonb;

-- Only the organizer sets a round's tee sheet, while the tournament is live.
create or replace function public.set_code_tournament_tee_sheet(p_organizer uuid, p_tournament uuid, p_round integer, p_sheet jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can set the tee sheet.' using errcode = '42501'; end if;
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if jsonb_typeof(p_sheet -> 'groups') <> 'array' then raise exception 'That tee sheet isn''t valid.' using errcode = '22023'; end if;
  update code_tournament_rounds set tee_sheet = p_sheet where tournament_id = p_tournament and number = p_round;
  if not found then raise exception 'That round isn''t in this tournament.' using errcode = '22023'; end if;
end $$;

-- As in tournament_codes.sql, with each round's teeSheet.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'setup', r.setup, 'date', r.round_date, 'teeSheet', r.tee_sheet) order by r.number), '[]'::jsonb)
               from code_tournament_rounds r where r.tournament_id = t.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'username', pr.username, 'handicap', p.handicap) order by p.joined_at), '[]'::jsonb)
                from code_tournament_players p join profiles pr on pr.id = p.profile_id where p.tournament_id = t.id),
    'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'round', h.round, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
              from code_tournament_holes h where h.tournament_id = t.id),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('profileId', c.profile_id, 'round', c.round, 'submittedAt', c.submitted_at)), '[]'::jsonb)
              from code_tournament_cards c where c.tournament_id = t.id))
  end
  from code_tournaments t where t.id = p_tournament;
$$;

revoke all on function public.set_code_tournament_tee_sheet(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.set_code_tournament_tee_sheet(uuid, uuid, integer, jsonb) to service_role;
revoke all on function public.get_code_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_code_tournament(uuid, uuid) to service_role;

commit;
