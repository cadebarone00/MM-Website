-- supabase/tournament_cuts.sql
-- A cut for tournaments by code: the organizer says whether there is one, and if so the top N players and ties, or a
-- cut number to par (at or better makes it), after which round. The app works out who makes it from the scores
-- (lib/platform/codeTournaments.ts, cutStatus); players who miss it drop off later rounds' tee sheets and scoring.
--
-- cut = { after: round number, kind: "top" | "score", value } | null (no cut)
--
-- Prerequisites: tournament_codes.sql, then tournament_tee_sheets.sql. Safe to run more than once.
-- Undo: alter table public.code_tournaments drop column cut; drop function public.set_code_tournament_cut(uuid, uuid, jsonb);
--       then re-run tournament_tee_sheets.sql (get_code_tournament without cut).

begin;

alter table public.code_tournaments add column if not exists cut jsonb;

-- Only the organizer sets the cut, while the tournament is live, and only before the last round.
create or replace function public.set_code_tournament_cut(p_organizer uuid, p_tournament uuid, p_cut jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_cut jsonb := case when p_cut is null or jsonb_typeof(p_cut) = 'null' then null else p_cut end;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can set the cut.' using errcode = '42501'; end if;
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if v_cut is not null and (v_cut ->> 'after')::integer >= (select max(number) from code_tournament_rounds where tournament_id = p_tournament) then
    raise exception 'The cut has to come before the last round.' using errcode = '22023';
  end if;
  update code_tournaments set cut = v_cut where id = p_tournament;
end $$;

-- As in tournament_tee_sheets.sql, with the cut.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at, 'cut', t.cut,
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

revoke all on function public.set_code_tournament_cut(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_code_tournament_cut(uuid, uuid, jsonb) to service_role;
revoke all on function public.get_code_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_code_tournament(uuid, uuid) to service_role;

commit;
