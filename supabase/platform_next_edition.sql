-- supabase/platform_next_edition.sql
-- Start next year: a recurring platform tournament gets a new edition (season) without a new tournament and without
-- new tournament players. Called only by the server (service role) for the signed-in profile.
--
-- What a new edition gets, from the edition the organizer starts it from:
--   * its own tournament_editions row (year, label = the year, optional dates; destination and timezone copied);
--   * its own edition_settings (scoring rules and plan copied — e.g. competition type, headcount);
--   * its own edition_rounds: round numbers, days, labels and formats copied; no courses, dates or start times;
--   * team NAMES and colours only if asked (keepTeams) — as new edition_teams rows with NO captain;
--   * an edition_roster row for each returning player the organizer picked (tournament_players.id), with no team and
--     no handicap. Nobody is enrolled automatically; skipped players simply aren't on it.
-- Returning players stay the SAME tournament_players rows, so a claimed golfer keeps their profile and an unclaimed one
-- keeps their open invite. New players are added afterwards through the usual players section.
--
-- Rules (enforced here): only the tournament's owners / organizers or a platform admin; one edition per year per
-- tournament (tournament_editions unique (tournament_id, season_year)); returning players must belong to this tournament;
-- the edition you start from is only read, never changed; The Maroon (a legacy tournament) creates its years in its own
-- system. All or nothing: a refused start leaves nothing behind.
--
-- Prerequisites: platform_foundation.sql, platform_create_tournament.sql (edition_settings.plan). Safe to run more
-- than once. Undo: drop function public.create_next_edition(uuid, uuid, jsonb), public.get_next_edition_draft(uuid, uuid);

begin;

-- What the Start next year page needs: the suggested year, the years that exist, every player of this tournament
-- (with whether they're on the year you start from), and that year's team names. Null when you can't manage it.
create or replace function public.get_next_edition_draft(p_profile uuid, p_from_edition uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when (coalesce((select platform_role = 'admin' from profiles where id = p_profile), false)
      or exists (select 1 from tournament_members m where m.tournament_id = e.tournament_id and m.profile_id = p_profile and m.role in ('owner', 'organizer')))
    and not t.is_legacy then jsonb_build_object(
      'fromYear', e.season_year,
      'suggestedYear', (select max(x.season_year) + 1 from tournament_editions x where x.tournament_id = e.tournament_id),
      'existingYears', (select jsonb_agg(x.season_year order by x.season_year) from tournament_editions x where x.tournament_id = e.tournament_id),
      'teams', coalesce((select jsonb_agg(jsonb_build_object('name', tm.name, 'color', tm.color) order by tm.sort_order, tm.created_at)
        from edition_teams tm where tm.edition_id = e.id), '[]'::jsonb),
      'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'joined', p.profile_id is not null,
          'onFromRoster', exists (select 1 from edition_roster r where r.edition_id = e.id and r.tournament_player_id = p.id),
          'lastSeason', (select max(x.season_year) from edition_roster r join tournament_editions x on x.id = r.edition_id where r.tournament_player_id = p.id))
        order by lower(p.display_name), p.created_at)
        from tournament_players p where p.tournament_id = e.tournament_id), '[]'::jsonb))
  end
  from tournament_editions e join tournaments t on t.id = e.tournament_id where e.id = p_from_edition;
$$;

-- p_input: { seasonYear, startDate?, endDate?, keepTeams?, playerIds: [tournament player ids] }.
-- Answers { editionId, seasonYear, tournamentSlug }.
create or replace function public.create_next_edition(p_profile uuid, p_from_edition uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from tournament_editions;
  v_tournament tournaments;
  v_year integer := (p_input->>'seasonYear')::integer;
  v_edition uuid;
  v_player uuid;
begin
  select * into v_from from tournament_editions where id = p_from_edition;
  if v_from.id is null then raise exception 'Edition not found.' using errcode = 'P0002'; end if;
  select * into v_tournament from tournaments where id = v_from.tournament_id;
  if not (coalesce((select platform_role = 'admin' from profiles where id = p_profile), false)
      or exists (select 1 from tournament_members m where m.tournament_id = v_tournament.id and m.profile_id = p_profile and m.role in ('owner', 'organizer'))) then
    raise exception 'Only this tournament''s organizers can start a new year.' using errcode = '42501';
  end if;
  if v_tournament.is_legacy then
    raise exception 'The Maroon Tournament''s years are created in the Admin Center.' using errcode = '22023';
  end if;
  if v_year is null or v_year not between 2000 and 2200 then
    raise exception 'Pick a year between 2000 and 2200.' using errcode = '22023';
  end if;
  if exists (select 1 from tournament_editions where tournament_id = v_tournament.id and season_year = v_year) then
    raise exception 'This tournament already has % — pick another year.', v_year using errcode = '23505';
  end if;

  insert into tournament_editions (tournament_id, season_year, label, destination, start_date, end_date, timezone, status)
  values (v_tournament.id, v_year, v_year::text, v_from.destination,
    nullif(p_input->>'startDate', '')::date, nullif(p_input->>'endDate', '')::date, v_from.timezone, 'draft')
  returning id into v_edition;

  insert into edition_settings (edition_id, scoring, plan)
  select v_edition, s.scoring, s.plan from edition_settings s where s.edition_id = v_from.id;
  if not found then insert into edition_settings (edition_id) values (v_edition); end if;

  insert into edition_rounds (edition_id, round_number, day, label, format)
  select v_edition, r.round_number, r.day, r.label, r.format from edition_rounds r where r.edition_id = v_from.id;

  if coalesce((p_input->>'keepTeams')::boolean, false) then
    insert into edition_teams (edition_id, key, name, short_name, color, logo_url, sort_order)
    select v_edition, tm.key, tm.name, tm.short_name, tm.color, tm.logo_url, tm.sort_order from edition_teams tm where tm.edition_id = v_from.id;
  end if;

  for v_player in select distinct (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_input->'playerIds', '[]'::jsonb)) loop
    if not exists (select 1 from tournament_players where id = v_player and tournament_id = v_tournament.id) then
      raise exception 'Unknown player.' using errcode = '22023';
    end if;
    insert into edition_roster (edition_id, tournament_id, tournament_player_id) values (v_edition, v_tournament.id, v_player);
  end loop;

  return jsonb_build_object('editionId', v_edition, 'seasonYear', v_year, 'tournamentSlug', v_tournament.slug);
end;
$$;

revoke all on function public.get_next_edition_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_next_edition(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_next_edition_draft(uuid, uuid) to service_role;
grant execute on function public.create_next_edition(uuid, uuid, jsonb) to service_role;

commit;
