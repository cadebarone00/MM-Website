-- supabase/platform_dashboard.sql
-- The saved Tournament Dashboard (THE_MAROON_PRODUCT_SPEC.md §5.1, COMPLETE
-- and PUBLISH): load one edition's setup, save one section at a time, and
-- publish/unpublish. Called only by server routes (service role) after they
-- validated the section with lib/platform/sectionRules.ts; every function
-- also re-checks that the caller manages the tournament.
--
-- Writes only platform tables. Never touches live_* (live scoring) tables;
-- commercial rounds stay planned-only until C4.
--
-- Prerequisites: platform_foundation.sql. Safe to run more than once.

begin;

-- Platform admin, or organizer/owner of the edition's tournament.
create or replace function public.can_manage_edition(p_profile uuid, p_edition uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role = 'admin' from profiles where id = p_profile), false)
      or exists (
        select 1 from tournament_editions e
        join tournament_members m on m.tournament_id = e.tournament_id
        where e.id = p_edition and m.profile_id = p_profile and m.role in ('organizer', 'owner')
      );
$$;

create or replace function public.get_tournament_setup(p_profile uuid, p_edition uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_edition tournament_editions;
  v_tournament tournaments;
  v_settings edition_settings;
  v_plan_entitlements jsonb;
begin
  if not can_manage_edition(p_profile, p_edition) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  select * into v_edition from tournament_editions where id = p_edition;
  select * into v_tournament from tournaments where id = v_edition.tournament_id;
  select * into v_settings from edition_settings where edition_id = p_edition;
  select p.entitlements into v_plan_entitlements
    from organizations o join platform_plans p on p.key = o.plan_key where o.id = v_tournament.organization_id;

  return jsonb_build_object(
    'tournament', jsonb_build_object('id', v_tournament.id, 'slug', v_tournament.slug, 'name', v_tournament.name,
      'shortName', v_tournament.short_name, 'description', v_tournament.description, 'visibility', v_tournament.visibility,
      'status', v_tournament.status, 'branding', v_tournament.branding, 'isLegacy', v_tournament.is_legacy),
    'edition', jsonb_build_object('id', v_edition.id, 'seasonYear', v_edition.season_year, 'destination', v_edition.destination,
      'startDate', v_edition.start_date, 'endDate', v_edition.end_date, 'timezone', v_edition.timezone,
      'status', v_edition.status, 'publishedAt', v_edition.published_at),
    'plan', coalesce(v_settings.plan, '{}'::jsonb),
    'scoring', coalesce(v_settings.scoring, '{}'::jsonb),
    'site', coalesce(v_settings.site, '{}'::jsonb),
    'media', coalesce(v_settings.media, '{"mode": "none"}'::jsonb),
    'entitlements', coalesce(v_plan_entitlements, '{}'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'key', t.key, 'name', t.name, 'color', t.color,
        'captainPlayerId', t.captain_player_id) order by t.sort_order, t.created_at)
      from edition_teams t where t.edition_id = p_edition), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email,
        'handicap', r.handicap, 'teamKey', t.key) order by r.created_at, p.display_name)
      from edition_roster r join tournament_players p on p.id = r.tournament_player_id
      left join edition_teams t on t.id = r.team_id where r.edition_id = p_edition), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'state', c.state,
        'teeName', c.tee_name, 'par', c.par, 'yards', c.yards, 'rating', c.rating, 'slope', c.slope) order by c.sort_order, c.created_at)
      from edition_courses c where c.edition_id = p_edition), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.round_number, 'day', r.day, 'label', r.label,
        'format', r.format, 'courseId', r.course_id, 'playDate', r.play_date, 'startType', r.start_type,
        'startTime', to_char(r.start_time, 'HH24:MI')) order by r.round_number)
      from edition_rounds r where r.edition_id = p_edition), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_tournament_section(p_profile uuid, p_edition uuid, p_section text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_item jsonb;
  v_id uuid;
  v_team uuid;
  v_keep uuid[] := '{}';
  v_index integer := 0;
begin
  if not can_manage_edition(p_profile, p_edition) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  if exists (select 1 from tournament_editions e join tournaments t on t.id = e.tournament_id where e.id = p_edition and t.is_legacy) then
    raise exception 'The Maroon Tournament is managed in the Admin Center.' using errcode = '42501';
  end if;
  select tournament_id into v_tournament from tournament_editions where id = p_edition;
  insert into edition_settings (edition_id) values (p_edition) on conflict (edition_id) do nothing;

  if p_section = 'basics' then
    update tournaments set name = p_data->>'name', short_name = p_data->>'shortName',
      description = nullif(p_data->>'description', ''), visibility = p_data->>'visibility', updated_at = now()
    where id = v_tournament;
    update tournament_editions set destination = nullif(p_data->>'destination', ''),
      start_date = nullif(p_data->>'startDate', '')::date, end_date = nullif(p_data->>'endDate', '')::date,
      timezone = p_data->>'timezone', updated_at = now()
    where id = p_edition;

  elsif p_section = 'teams' then
    update edition_settings set plan = plan || jsonb_build_object('competitionType', p_data->>'competitionType'), updated_at = now()
    where edition_id = p_edition;
    for v_item in select * from jsonb_array_elements(coalesce(p_data->'teams', '[]'::jsonb)) loop
      v_id := nullif(v_item->>'id', '')::uuid;
      if v_id is null then
        insert into edition_teams (edition_id, key, name, color, sort_order)
        values (p_edition, 'team-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), v_item->>'name', v_item->>'color', v_index)
        returning id into v_id;
      else
        update edition_teams set name = v_item->>'name', color = v_item->>'color', sort_order = v_index
        where id = v_id and edition_id = p_edition;
        if not found then raise exception 'Unknown team.' using errcode = '22023'; end if;
      end if;
      -- A captain must be on this edition's roster, on this team.
      if nullif(v_item->>'captainPlayerId', '') is not null and not exists (
        select 1 from edition_roster where edition_id = p_edition and tournament_player_id = (v_item->>'captainPlayerId')::uuid and team_id = v_id
      ) then
        raise exception 'A captain must be a player on that team.' using errcode = '22023';
      end if;
      update edition_teams set captain_player_id = nullif(v_item->>'captainPlayerId', '')::uuid where id = v_id;
      v_keep := v_keep || v_id;
      v_index := v_index + 1;
    end loop;
    -- Removed teams (and an individual event has none): players stay, unassigned.
    update edition_roster set team_id = null where edition_id = p_edition and team_id is not null and not (team_id = any(v_keep));
    delete from edition_teams where edition_id = p_edition and not (id = any(v_keep));

  elsif p_section = 'players' then
    update edition_settings set plan = plan || jsonb_build_object('expectedPlayerCount', (p_data->>'expectedPlayerCount')::integer), updated_at = now()
    where edition_id = p_edition and p_data ? 'expectedPlayerCount';
    for v_item in select * from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) loop
      v_id := nullif(v_item->>'id', '')::uuid;
      if v_id is null then
        insert into tournament_players (tournament_id, display_name, email)
        values (v_tournament, v_item->>'name', nullif(v_item->>'email', '')) returning id into v_id;
      else
        update tournament_players set display_name = v_item->>'name', email = nullif(v_item->>'email', ''), updated_at = now()
        where id = v_id and tournament_id = v_tournament;
        if not found then raise exception 'Unknown player.' using errcode = '22023'; end if;
      end if;
      v_team := null;
      if nullif(v_item->>'teamKey', '') is not null then
        select id into v_team from edition_teams where edition_id = p_edition and key = v_item->>'teamKey';
        if v_team is null then raise exception 'Unknown team.' using errcode = '22023'; end if;
      end if;
      insert into edition_roster (edition_id, tournament_id, tournament_player_id, team_id, handicap)
      values (p_edition, v_tournament, v_id, v_team, nullif(v_item->>'handicap', '')::numeric)
      on conflict (edition_id, tournament_player_id) do update set team_id = excluded.team_id, handicap = excluded.handicap;
      v_keep := v_keep || v_id;
    end loop;
    delete from edition_roster where edition_id = p_edition and not (tournament_player_id = any(v_keep));
    -- A captain who left the roster, or moved team, is no longer captain.
    update edition_teams t set captain_player_id = null
    where t.edition_id = p_edition and t.captain_player_id is not null and not exists (
      select 1 from edition_roster r where r.edition_id = p_edition and r.tournament_player_id = t.captain_player_id and r.team_id = t.id);

  elsif p_section = 'courses' then
    for v_item in select * from jsonb_array_elements(coalesce(p_data->'courses', '[]'::jsonb)) loop
      v_id := nullif(v_item->>'id', '')::uuid;
      if v_id is null then
        insert into edition_courses (edition_id, name, city, state, tee_name, par, yards, rating, slope, sort_order)
        values (p_edition, v_item->>'name', nullif(v_item->>'city', ''), nullif(v_item->>'state', ''), nullif(v_item->>'teeName', ''),
          (v_item->>'par')::integer, (v_item->>'yards')::integer, (v_item->>'rating')::numeric, (v_item->>'slope')::integer, v_index)
        returning id into v_id;
      else
        update edition_courses set name = v_item->>'name', city = nullif(v_item->>'city', ''), state = nullif(v_item->>'state', ''),
          tee_name = nullif(v_item->>'teeName', ''), par = (v_item->>'par')::integer, yards = (v_item->>'yards')::integer,
          rating = (v_item->>'rating')::numeric, slope = (v_item->>'slope')::integer, sort_order = v_index
        where id = v_id and edition_id = p_edition;
        if not found then raise exception 'Unknown course.' using errcode = '22023'; end if;
      end if;
      v_keep := v_keep || v_id;
      v_index := v_index + 1;
    end loop;
    delete from edition_courses where edition_id = p_edition and not (id = any(v_keep));

  elsif p_section = 'rounds' then
    -- Round N keeps its schedule when its plan changes; rounds past the new count go.
    for v_item in select * from jsonb_array_elements(coalesce(p_data->'rounds', '[]'::jsonb)) loop
      v_index := v_index + 1;
      insert into edition_rounds (edition_id, round_number, day, label, format, course_id)
      values (p_edition, v_index, (v_item->>'day')::integer, nullif(v_item->>'label', ''), nullif(v_item->>'format', ''), nullif(v_item->>'courseId', '')::uuid)
      on conflict (edition_id, round_number) do update
        set day = excluded.day, label = excluded.label, format = excluded.format, course_id = excluded.course_id;
    end loop;
    delete from edition_rounds where edition_id = p_edition and round_number > v_index;

  elsif p_section = 'schedule' then
    for v_item in select * from jsonb_array_elements(coalesce(p_data->'rounds', '[]'::jsonb)) loop
      update edition_rounds set play_date = nullif(v_item->>'playDate', '')::date, start_type = nullif(v_item->>'startType', ''),
        start_time = nullif(v_item->>'startTime', '')::time
      where edition_id = p_edition and round_number = (v_item->>'number')::integer;
      if not found then raise exception 'Unknown round.' using errcode = '22023'; end if;
    end loop;

  elsif p_section = 'rules' then
    update edition_settings set scoring = p_data, updated_at = now() where edition_id = p_edition;

  elsif p_section = 'branding' then
    update tournaments set branding = p_data, updated_at = now() where id = v_tournament;

  elsif p_section = 'website' then
    update edition_settings set site = p_data, updated_at = now() where edition_id = p_edition;

  elsif p_section = 'media' then
    if p_data->>'mode' = 'maroon_hosted' and not exists (
      select 1 from tournaments t join organizations o on o.id = t.organization_id join platform_plans p on p.key = o.plan_key
      where t.id = v_tournament and p.entitlements->>'hosted_media' = 'true'
    ) then
      raise exception 'Hosted media isn''t available for this tournament.' using errcode = '42501';
    end if;
    update edition_settings set media = p_data, updated_at = now() where edition_id = p_edition;

  else
    raise exception 'Unknown section.' using errcode = '22023';
  end if;

  return get_tournament_setup(p_profile, p_edition);
end;
$$;

-- PUBLISH is its own action, separate from CREATE and from section saves.
-- The server route only calls this with p_publish = true after the shared
-- readiness engine (lib/platform/readiness.ts) says the setup is ready.
create or replace function public.set_edition_published(p_profile uuid, p_edition uuid, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_edition(p_profile, p_edition) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  if exists (select 1 from tournament_editions e join tournaments t on t.id = e.tournament_id where e.id = p_edition and t.is_legacy) then
    raise exception 'The Maroon Tournament is managed in the Admin Center.' using errcode = '42501';
  end if;
  update tournament_editions
  set status = case when p_publish then 'scheduled' else 'draft' end,
      published_at = case when p_publish then coalesce(published_at, now()) else null end,
      updated_at = now()
  where id = p_edition and status in ('draft', 'scheduled');
  update tournaments set status = case when p_publish then 'active' else status end, updated_at = now()
  where id = (select tournament_id from tournament_editions where id = p_edition) and status = 'draft' and p_publish;
  return get_tournament_setup(p_profile, p_edition);
end;
$$;

-- My Tournaments (/tournaments): every edition of every tournament the
-- profile OWNS or ORGANIZES, as the same setup the dashboard reads (so the one
-- readiness engine can judge it) minus player emails, handicaps, player ids
-- and plan entitlements. Membership only: players/viewers get nothing, and a
-- platform admin sees just the tournaments they are a member of (admins still
-- reach any dashboard by its URL). The Maroon Tournament (managed in the
-- Admin Center) and test editions are left out. Never reads live_* tables.
create or replace function public.list_managed_editions(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'role', m.role,
      'updatedAt', greatest(t.updated_at, e.updated_at, s.updated_at,
        (select max(r.created_at) from edition_rounds r where r.edition_id = e.id),
        (select max(c.created_at) from edition_courses c where c.edition_id = e.id),
        (select max(r.created_at) from edition_roster r where r.edition_id = e.id)),
      'setup', (select jsonb_set(x - 'entitlements', '{players}',
          coalesce((select jsonb_agg(p - 'email' - 'handicap' - 'id') from jsonb_array_elements(x -> 'players') p), '[]'::jsonb))
        from (select get_tournament_setup(p_profile, e.id) as x) q)
    ) order by t.name, e.season_year desc), '[]'::jsonb)
  from tournament_members m
  join tournaments t on t.id = m.tournament_id
  join tournament_editions e on e.tournament_id = t.id
  left join edition_settings s on s.edition_id = e.id
  where m.profile_id = p_profile and m.role in ('owner', 'organizer') and not t.is_legacy and not e.is_test;
$fn$;

revoke all on function public.can_manage_edition(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_tournament_setup(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_tournament_section(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.set_edition_published(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.can_manage_edition(uuid, uuid) to service_role;
grant execute on function public.get_tournament_setup(uuid, uuid) to service_role;
grant execute on function public.save_tournament_section(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.set_edition_published(uuid, uuid, boolean) to service_role;
revoke all on function public.list_managed_editions(uuid) from public, anon, authenticated;
grant execute on function public.list_managed_editions(uuid) to service_role;

commit;
