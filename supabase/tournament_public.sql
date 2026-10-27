-- supabase/tournament_public.sql
-- Public tournaments (by code): the organizer makes a tournament public or private in Tournament Settings. Public ones
-- show in the Tourneys search and its Live / Upcoming / Past lists, and anyone can follow their leaderboard and tee sheet
-- (read only, no sign-in) at /tournaments/live/<id>. New tournaments start private.
--
-- Spectators never touch the database: the server finds a public tournament's organizer with the service-role key,
-- reads it as them and strips ids and the join code (lib/platform/watchView.ts, spectatorTournament).
--
-- Prerequisites: tournament_codes.sql, tournament_tee_sheets.sql, tournament_cuts.sql. Safe to run more than once.
-- Undo: alter table public.code_tournaments drop column is_public; drop function public.set_code_tournament_public(uuid, uuid, boolean),
--       public.search_public_code_tournaments(text, date), public.public_code_tournament_organizer(uuid);
--       then re-run tournament_cuts.sql (get_code_tournament without isPublic).

begin;

alter table public.code_tournaments add column if not exists is_public boolean not null default false;

-- Only the organizer makes the tournament public or private.
create or replace function public.set_code_tournament_public(p_organizer uuid, p_tournament uuid, p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can change this.' using errcode = '42501'; end if;
  update code_tournaments set is_public = coalesce(p_public, false) where id = p_tournament;
end $$;

-- Public tournaments (Tourneys → search, and its Live / Upcoming / Past lists), newest first, up to 60. `p_query`: words
-- in the name, or in any round's course name or place (city / state). `p_date`: a round is played that day. Either can
-- be empty; with neither, every public tournament. (An earlier version took only the words: dropped below.)
drop function if exists public.search_public_code_tournaments(text);
create or replace function public.search_public_code_tournaments(p_query text, p_date date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'scoring', t.scoring, 'status', t.status, 'organizerName', pr.display_name,
    'playerCount', (select count(*) from code_tournament_players p where p.tournament_id = t.id),
    'firstDate', (select min(round_date) from code_tournament_rounds r where r.tournament_id = t.id),
    'lastDate', (select max(round_date) from code_tournament_rounds r where r.tournament_id = t.id),
    'course', (select r.setup #>> '{course,name}' from code_tournament_rounds r where r.tournament_id = t.id order by r.number limit 1),
    'place', (select r.setup #>> '{course,place}' from code_tournament_rounds r where r.tournament_id = t.id order by r.number limit 1)
  ) order by t.created_at desc), '[]'::jsonb)
  from (select * from code_tournaments x where x.is_public
          and (coalesce(btrim(p_query), '') = '' or position(lower(btrim(p_query)) in lower(x.name)) > 0
               or exists (select 1 from code_tournament_rounds r where r.tournament_id = x.id
                          and position(lower(btrim(p_query)) in lower(coalesce(r.setup #>> '{course,name}', '') || ' ' || coalesce(r.setup #>> '{course,place}', ''))) > 0))
          and (p_date is null or exists (select 1 from code_tournament_rounds r where r.tournament_id = x.id and r.round_date = p_date))
        order by x.created_at desc limit 60) t
  join profiles pr on pr.id = t.organizer;
$$;

-- A public tournament's organizer (the server reads the tournament as them for spectators); null if it isn't public.
create or replace function public.public_code_tournament_organizer(p_tournament uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organizer from code_tournaments where id = p_tournament and is_public;
$$;

-- As in tournament_cuts.sql, with isPublic.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at, 'cut', t.cut, 'isPublic', t.is_public,
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

do $$
declare f text;
begin
  foreach f in array array['set_code_tournament_public(uuid, uuid, boolean)', 'search_public_code_tournaments(text, date)',
    'public_code_tournament_organizer(uuid)', 'get_code_tournament(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
