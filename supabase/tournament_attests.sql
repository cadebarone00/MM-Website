-- supabase/tournament_attests.sql
-- Attesting for tournaments by code, like golf trips: in each round every player keeps score for one other player in
-- their tee sheet group (around the group: A keeps B, B keeps C … the last keeps A; a twosome keeps each other; a single
-- has no attester). Who attests whom comes from the round's tee sheet (lib/platform/codeTournaments.ts, attestPairs);
-- the server checks it before calling these functions (app/api/code-tournaments/[id]/route.ts).
--
-- A player's card can only be submitted once their attester's entries match their own strokes on every hole (checked
-- by the server before submit_code_tournament_card).
--
-- Prerequisites: tournament_codes.sql, tournament_tee_sheets.sql, tournament_cuts.sql, tournament_public.sql,
-- tournament_documents.sql. Safe to run more than once.
-- Undo: drop table public.code_tournament_attests; drop function public.set_code_tournament_attest(uuid, uuid, integer, uuid, integer, integer);
--       then re-run tournament_documents.sql (get_code_tournament without attests).

begin;

-- What an attester entered for the player they keep score for, hole by hole.
create table if not exists public.code_tournament_attests (
  tournament_id uuid not null references public.code_tournaments(id) on delete cascade,
  round integer not null,
  attester_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  strokes integer not null check (strokes between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round, attester_id, player_id, hole),
  check (attester_id <> player_id),
  foreign key (tournament_id, round) references public.code_tournament_rounds(tournament_id, number) on delete cascade
);
alter table public.code_tournament_attests enable row level security;
revoke all on public.code_tournament_attests from public, anon, authenticated;

-- An attester's entry for a player (null strokes clears it): both are playing, the tournament is live, and the player
-- hasn't submitted that round's card yet.
create or replace function public.set_code_tournament_attest(p_attester uuid, p_tournament uuid, p_round integer, p_player uuid, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_holes integer;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if p_attester = p_player then raise exception 'You can''t attest your own card.' using errcode = '22023'; end if;
  if (select count(*) from code_tournament_players where tournament_id = p_tournament and profile_id in (p_attester, p_player)) < 2 then
    raise exception 'You''re not both playing in this tournament.' using errcode = '42501';
  end if;
  select jsonb_array_length(setup #> '{course,par}') into v_holes from code_tournament_rounds where tournament_id = p_tournament and number = p_round;
  if v_holes is null then raise exception 'That round isn''t in this tournament.' using errcode = '22023'; end if;
  if p_hole < 1 or p_hole > v_holes then raise exception 'That hole isn''t on this course.' using errcode = '22023'; end if;
  if exists (select 1 from code_tournament_cards where tournament_id = p_tournament and round = p_round and profile_id = p_player) then
    raise exception 'That card has already been submitted.' using errcode = '22023';
  end if;
  if p_strokes is null then
    delete from code_tournament_attests where tournament_id = p_tournament and round = p_round and attester_id = p_attester and player_id = p_player and hole = p_hole;
  else
    insert into code_tournament_attests (tournament_id, round, attester_id, player_id, hole, strokes) values (p_tournament, p_round, p_attester, p_player, p_hole, p_strokes)
    on conflict (tournament_id, round, attester_id, player_id, hole) do update set strokes = excluded.strokes, updated_at = now();
  end if;
end $$;

-- As in tournament_documents.sql, with the attest entries.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at, 'cut', t.cut, 'isPublic', t.is_public, 'infoPdf', t.info_pdf,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'setup', r.setup, 'date', r.round_date, 'teeSheet', r.tee_sheet, 'pinSheetPdf', r.pin_sheet_pdf) order by r.number), '[]'::jsonb)
               from code_tournament_rounds r where r.tournament_id = t.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'username', pr.username, 'handicap', p.handicap) order by p.joined_at), '[]'::jsonb)
                from code_tournament_players p join profiles pr on pr.id = p.profile_id where p.tournament_id = t.id),
    'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'round', h.round, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
              from code_tournament_holes h where h.tournament_id = t.id),
    'attests', (select coalesce(jsonb_agg(jsonb_build_object('attester', a.attester_id, 'player', a.player_id, 'round', a.round, 'hole', a.hole, 'strokes', a.strokes)), '[]'::jsonb)
                from code_tournament_attests a where a.tournament_id = t.id),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('profileId', c.profile_id, 'round', c.round, 'submittedAt', c.submitted_at)), '[]'::jsonb)
              from code_tournament_cards c where c.tournament_id = t.id))
  end
  from code_tournaments t where t.id = p_tournament;
$$;

revoke all on function public.set_code_tournament_attest(uuid, uuid, integer, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.set_code_tournament_attest(uuid, uuid, integer, uuid, integer, integer) to service_role;
revoke all on function public.get_code_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_code_tournament(uuid, uuid) to service_role;

commit;
