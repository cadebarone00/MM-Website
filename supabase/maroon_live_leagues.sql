-- supabase/maroon_live_leagues.sql
-- The Maroon Live, Step 3 (project_specs.md, "Feature: The Maroon Live"): leagues join the live sites.
--   * every league gets a watch code (the share link, /tap-in/<code>), like trips and tournaments
--   * the share link opens a league unless it's Private
--   * the organizer changes who can watch (set_live_visibility, kind 'league')
--   * Public leagues show in the directory (list_public_live_events)
-- Leagues already got live_visibility (default Private) and live_players_can_share from maroon_live_visibility.sql.
--
-- Prerequisites: leagues.sql, watch_codes.sql, maroon_live_visibility.sql, maroon_live_directory.sql. Safe to run more
-- than once.
-- Undo: alter table public.leagues drop column watch_code; then re-run watch_codes.sql (new_watch_code),
--       maroon_live_visibility.sql (find_watch_code, set_live_visibility) and maroon_live_directory.sql.

begin;

-- 1. A fresh watch code is now unused by leagues too.
create or replace function public.new_watch_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_code text;
  v_letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := 'W' || (select string_agg(substr(v_letters, 1 + floor(random() * length(v_letters))::integer, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from code_tournaments where watch_code = v_code or code = v_code)
          and not exists (select 1 from golf_trips where watch_code = v_code)
          and not exists (select 1 from leagues where watch_code = v_code or code = v_code);
  end loop;
  return v_code;
end $$;

-- 2. Every league gets one (existing ones now, new ones when they're created).
alter table public.leagues add column if not exists watch_code text;
update public.leagues set watch_code = public.new_watch_code() where watch_code is null;
alter table public.leagues alter column watch_code set default public.new_watch_code();
alter table public.leagues alter column watch_code set not null;
create unique index if not exists leagues_watch_code on public.leagues (watch_code);

-- 3. The share link: as maroon_live_visibility.sql, plus leagues.
create or replace function public.find_watch_code(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as code)
  select coalesce(
    (select jsonb_build_object('kind', 'tournament', 'id', t.id, 'organizer', t.organizer)
       from code_tournaments t, c where t.watch_code = c.code and t.live_visibility <> 'private'),
    (select jsonb_build_object('kind', 'trip', 'id', g.id, 'organizer',
       (select m.profile_id from golf_trip_members m where m.golf_trip_id = g.id and m.role = 'organizer' and m.profile_id is not null limit 1))
       from golf_trips g, c where g.watch_code = c.code and g.live_visibility <> 'private'),
    (select jsonb_build_object('kind', 'league', 'id', l.id, 'organizer', l.organizer)
       from leagues l, c where l.watch_code = c.code and l.live_visibility <> 'private'));
$$;

-- 4. Who can watch: as maroon_live_visibility.sql, plus leagues.
create or replace function public.set_live_visibility(p_profile uuid, p_kind text, p_id uuid, p_visibility text, p_players_can_share boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_visibility is null or p_visibility not in ('public', 'link', 'private') then
    raise exception 'Pick Public, Link only or Private.' using errcode = '22023';
  end if;
  if p_kind = 'trip' then
    if not exists (select 1 from golf_trip_members where golf_trip_id = p_id and profile_id = p_profile
                   and role = 'organizer' and invitation_status = 'accepted') then
      raise exception 'Only the organizer can change who can watch.' using errcode = '42501';
    end if;
    update golf_trips set live_visibility = p_visibility, live_players_can_share = coalesce(p_players_can_share, live_players_can_share) where id = p_id;
  elsif p_kind = 'tournament' then
    if not exists (select 1 from code_tournaments where id = p_id and organizer = p_profile) then
      raise exception 'Only the organizer can change who can watch.' using errcode = '42501';
    end if;
    update code_tournaments set live_visibility = p_visibility, is_public = (p_visibility = 'public'),
      live_players_can_share = coalesce(p_players_can_share, live_players_can_share) where id = p_id;
  elsif p_kind = 'league' then
    if not exists (select 1 from leagues where id = p_id and organizer = p_profile) then
      raise exception 'Only the organizer can change who can watch.' using errcode = '42501';
    end if;
    update leagues set live_visibility = p_visibility, live_players_can_share = coalesce(p_players_can_share, live_players_can_share) where id = p_id;
  else
    raise exception 'Unknown event kind.' using errcode = '22023';
  end if;
  return found;
end $$;

-- 5. The directory: as maroon_live_directory.sql, plus Public leagues (one day, one course).
create or replace function public.list_public_live_events(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as words),
  events as (
    select 'trip'::text as kind, g.name, g.watch_code, g.start_date as first_date, g.end_date as last_date,
      (g.status = 'completed') as ended,
      (select r.course_name from golf_trip_rounds r where r.golf_trip_id = g.id and coalesce(btrim(r.course_name), '') <> '' order by r.round_number limit 1) as course,
      (select count(*) from golf_trip_members m where m.golf_trip_id = g.id and m.invitation_status = 'accepted') as players,
      g.created_at
    from golf_trips g where g.live_visibility = 'public'
    union all
    select 'tournament', t.name, t.watch_code,
      (select min(r.round_date) from code_tournament_rounds r where r.tournament_id = t.id),
      (select max(r.round_date) from code_tournament_rounds r where r.tournament_id = t.id),
      (t.status = 'ended'),
      (select r.setup #>> '{course,name}' from code_tournament_rounds r where r.tournament_id = t.id order by r.number limit 1),
      (select count(*) from code_tournament_players p where p.tournament_id = t.id),
      t.created_at
    from code_tournaments t where t.live_visibility = 'public'
    union all
    select 'league', l.name, l.watch_code, l.round_date, l.round_date, (l.status = 'ended'), l.course ->> 'name',
      (select count(*) from league_players p where p.league_id = l.id), l.created_at
    from leagues l where l.live_visibility = 'public'
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'name', e.name, 'code', e.watch_code, 'firstDate', e.first_date,
      'lastDate', e.last_date, 'ended', e.ended, 'course', e.course, 'playerCount', e.players) order by e.created_at desc), '[]'::jsonb)
  from (select * from events, q where q.words = '' or position(q.words in lower(events.name || ' ' || coalesce(events.course, ''))) > 0
        order by events.created_at desc limit 60) e;
$$;

revoke all on function public.new_watch_code() from public, anon, authenticated;
grant execute on function public.new_watch_code() to service_role;
revoke all on function public.find_watch_code(text) from public, anon, authenticated;
grant execute on function public.find_watch_code(text) to service_role;
revoke all on function public.set_live_visibility(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_live_visibility(uuid, text, uuid, text, boolean) to service_role;
revoke all on function public.list_public_live_events(text) from public, anon, authenticated;
grant execute on function public.list_public_live_events(text) to service_role;

commit;
