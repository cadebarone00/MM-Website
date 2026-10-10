-- supabase/profile_read_model.sql
-- Profile read model (project_specs.md, "Profile read model"): one golfer's participation history, in one call.
--
--   get_profile_history(p_viewer, p_subject)
--     trips        golf trips the subject actually belongs to: golf_trip_members.profile_id = subject AND accepted.
--                  Pending or declined invitations are not participation.
--     tournaments  editions the subject played: profile → tournament_players → edition_roster, with that edition's
--                  team and whether they captained it (edition_teams.captain_player_id). tournament_members (owner /
--                  organizer / viewer access) is NOT playing history and is never read here. Test editions are left out.
--
-- Teams come from each edition's roster, never from the profile (a golfer can be on different teams in different years).
-- Returns display fields only: no emails, profile ids, auth ids, invite data or other members' details.
--
-- Privacy: only the subject sees this for now (p_viewer = p_subject). Anyone else gets { restricted: true } with empty
-- lists, until public profiles are designed. Rounds have their own reader (list_profile_rounds, player_rounds.sql).
--
-- Called only by the server (service role): lib/profile/profileReadModelServer.ts.
-- Prerequisites: platform_foundation.sql, golf_trips.sql. Safe to run more than once.
-- Undo: drop function if exists public.get_profile_history(uuid, uuid);

begin;

create or replace function public.get_profile_history(p_viewer uuid, p_subject uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_viewer is null or p_viewer <> p_subject or not exists (select 1 from profiles where id = p_subject)
    then jsonb_build_object('restricted', true, 'trips', '[]'::jsonb, 'tournaments', '[]'::jsonb)
  else jsonb_build_object(
    'restricted', false,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'destination', t.destination, 'startDate', t.start_date, 'endDate', t.end_date,
          'role', m.role,
          'playerCount', (select count(*) from golf_trip_members x
                          where x.golf_trip_id = t.id and x.profile_id is not null and x.invitation_status = 'accepted'))
        order by t.start_date desc nulls first, t.created_at desc)
      from golf_trip_members m join golf_trips t on t.id = m.golf_trip_id
      where m.profile_id = p_subject and m.invitation_status = 'accepted'), '[]'::jsonb),
    'tournaments', coalesce((
      select jsonb_agg(jsonb_build_object(
          'slug', t.slug, 'name', t.name, 'year', e.season_year, 'label', e.label, 'destination', e.destination,
          'startDate', e.start_date, 'endDate', e.end_date,
          'team', case when tm.id is null then null else jsonb_build_object('name', tm.name, 'color', tm.color) end,
          'isCaptain', coalesce(tm.captain_player_id = p.id, false))
        order by e.season_year desc, t.name)
      from tournament_players p
      join edition_roster r on r.tournament_player_id = p.id
      join tournament_editions e on e.id = r.edition_id
      join tournaments t on t.id = e.tournament_id
      left join edition_teams tm on tm.id = r.team_id
      where p.profile_id = p_subject and not e.is_test), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.get_profile_history(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_profile_history(uuid, uuid) to service_role;

commit;
