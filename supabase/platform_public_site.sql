-- supabase/platform_public_site.sql
-- The public tournament site /t/[tournament]/[year] (THE_MAROON_PRODUCT_SPEC.md §9).
-- One visitor-safe read: it returns ONLY data meant for the public site, so
-- private fields (emails, handicaps, organizer and plan data, internal ids)
-- never leave the database for a visitor.
--
-- Who can see an edition:
--   * it must be published (tournament_editions.published_at), and not the test season;
--   * public   → anyone;
--   * unlisted → anyone with the link (never listed anywhere; pages are noindex);
--   * private  → only the tournament's members and platform admins.
-- Anyone else gets null — identical to "no such tournament", so a private
-- tournament's existence isn't revealed. The founding (legacy) tournament
-- keeps its own site and is never served here.
--
-- The organizer preview (get_tournament_site_preview) shows the same projection
-- to the tournament's organizers before publishing; it needs platform_dashboard.sql.
--
-- Prerequisites: platform_foundation.sql, platform_dashboard.sql. Safe to run more than once.

begin;

create or replace function public.can_view_tournament(p_tournament uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case t.visibility
    when 'private' then p_viewer is not null and (
      exists (select 1 from profiles where id = p_viewer and platform_role = 'admin')
      or exists (select 1 from tournament_members where tournament_id = t.id and profile_id = p_viewer))
    else true
  end
  from tournaments t where t.id = p_tournament and not t.is_legacy;
$$;

-- Published years this viewer may see, newest first (for /t/[tournament] → latest edition).
create or replace function public.get_public_tournament_years(p_slug text, p_viewer uuid default null)
returns integer[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(e.season_year order by e.season_year desc), '{}')
  from tournaments t join tournament_editions e on e.tournament_id = t.id
  where t.slug = p_slug and not t.is_legacy and e.published_at is not null and not e.is_test
    and coalesce(can_view_tournament(t.id, p_viewer), false);
$$;

-- What the public site shows for one edition — the ONLY place that decides
-- which fields are public. No access checks here: every caller (the public
-- reader below, the organizer preview) checks access first. Service role only.
create or replace function public.tournament_site_projection(p_edition uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_t tournaments;
  v_e tournament_editions;
  v_s edition_settings;
begin
  select * into v_e from tournament_editions where id = p_edition;
  if v_e.id is null then return null; end if;
  select * into v_t from tournaments where id = v_e.tournament_id;
  select * into v_s from edition_settings where edition_id = v_e.id;
  return jsonb_build_object(
    'tournament', jsonb_build_object('slug', v_t.slug, 'name', v_t.name, 'shortName', v_t.short_name,
      'description', v_t.description, 'visibility', v_t.visibility,
      'branding', jsonb_build_object('primary', v_t.branding->>'primary', 'secondary', v_t.branding->>'secondary',
        'accent', v_t.branding->>'accent', 'logoUrl', v_t.branding->>'logoUrl', 'heroImageUrl', v_t.branding->>'heroImageUrl')),
    'edition', jsonb_build_object('seasonYear', v_e.season_year, 'destination', v_e.destination, 'startDate', v_e.start_date,
      'endDate', v_e.end_date, 'timezone', v_e.timezone, 'status', v_e.status),
    'competitionType', coalesce(v_s.plan->>'competitionType', 'individual'),
    'scoring', case when v_s.scoring->>'mode' is null then null else jsonb_build_object(
      'mode', v_s.scoring->>'mode', 'pointsForWin', v_s.scoring->'pointsForWin', 'pointsForHalve', v_s.scoring->'pointsForHalve',
      'handicap', v_s.scoring->>'handicap', 'allowancePercent', v_s.scoring->'allowancePercent') end,
    'site', coalesce(v_s.site, '{}'::jsonb),
    'media', case when v_s.media->>'mode' = 'device_external'
      then jsonb_build_object('mode', 'device_external', 'links', coalesce(v_s.media->'links', '[]'::jsonb))
      else jsonb_build_object('mode', 'none', 'links', '[]'::jsonb) end,
    -- Short public labels (t1, p1, c1) instead of database ids.
    'teams', coalesce((select jsonb_agg(jsonb_build_object('ref', 't' || t.n, 'name', t.name, 'color', t.color) order by t.n)
      from (select name, color, row_number() over (order by sort_order, created_at) n from edition_teams where edition_id = v_e.id) t), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('ref', 'p' || x.n, 'name', x.display_name, 'teamRef', x.team_ref, 'captain', x.captain) order by x.n)
      from (
        select p.display_name,
          row_number() over (order by r.created_at, p.display_name) n,
          (select 't' || tt.n from (select id, row_number() over (order by sort_order, created_at) n from edition_teams where edition_id = v_e.id) tt where tt.id = r.team_id) team_ref,
          exists (select 1 from edition_teams ct where ct.edition_id = v_e.id and ct.captain_player_id = p.id and ct.id = r.team_id) captain
        from edition_roster r join tournament_players p on p.id = r.tournament_player_id
        where r.edition_id = v_e.id
      ) x), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('ref', 'c' || c.n, 'name', c.name, 'city', c.city, 'state', c.state,
        'teeName', c.tee_name, 'par', c.par, 'yards', c.yards) order by c.n)
      from (select *, row_number() over (order by sort_order, created_at) n from edition_courses where edition_id = v_e.id) c), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('number', r.round_number, 'day', r.day, 'label', r.label, 'format', r.format,
        'courseRef', (select 'c' || cc.n from (select id, row_number() over (order by sort_order, created_at) n from edition_courses where edition_id = v_e.id) cc where cc.id = r.course_id),
        'playDate', r.play_date, 'startType', r.start_type, 'startTime', to_char(r.start_time, 'HH24:MI')) order by r.round_number)
      from edition_rounds r where r.edition_id = v_e.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_public_tournament_site(p_slug text, p_year integer, p_viewer uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_t tournaments;
  v_e tournament_editions;
begin
  select * into v_t from tournaments where slug = p_slug and not is_legacy;
  if v_t.id is null then return null; end if;
  select * into v_e from tournament_editions where tournament_id = v_t.id and season_year = p_year;
  if v_e.id is null or v_e.published_at is null or v_e.is_test then return null; end if;
  if not coalesce(can_view_tournament(v_t.id, p_viewer), false) then return null; end if;
  return tournament_site_projection(v_e.id);
end;
$$;

-- Organizer preview (Tournament Dashboard → Preview Website). Shows the same
-- projection visitors will get, before publishing and for private
-- tournaments, but only to the tournament's organizers/owner and platform
-- admins. It does not change get_public_tournament_site in any way.
create or replace function public.get_tournament_site_preview(p_profile uuid, p_edition uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_edition(p_profile, p_edition) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  if exists (select 1 from tournament_editions e join tournaments t on t.id = e.tournament_id where e.id = p_edition and t.is_legacy) then
    raise exception 'The Maroon Tournament is managed in the Admin Center.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'site', tournament_site_projection(p_edition),
    'published', (select published_at is not null from tournament_editions where id = p_edition));
end;
$$;

revoke all on function public.can_view_tournament(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_public_tournament_years(text, uuid) from public, anon, authenticated;
revoke all on function public.get_public_tournament_site(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.can_view_tournament(uuid, uuid) to service_role;
grant execute on function public.get_public_tournament_years(text, uuid) to service_role;
grant execute on function public.get_public_tournament_site(text, integer, uuid) to service_role;
revoke all on function public.tournament_site_projection(uuid) from public, anon, authenticated;
revoke all on function public.get_tournament_site_preview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tournament_site_projection(uuid) to service_role;
grant execute on function public.get_tournament_site_preview(uuid, uuid) to service_role;

commit;
