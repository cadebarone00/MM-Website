-- supabase/maroon_live_directory.sql
-- The Maroon Live, Step 2 (project_specs.md, "Feature: The Maroon Live"): the public directory at /tap-in. Lists every
-- Public trip and tournament (live_visibility = 'public'): name, dates, first course, a trip's location (its destination
-- text, e.g. "Pinehurst, NC"; owner 2026-11-22), player count and the share code that opens its live page (/tap-in/<code>).
-- Never lodging, flights, emails or ids.
--
-- Prerequisites: maroon_live_visibility.sql (and what it needs). Safe to run more than once.
-- Undo: drop function public.list_public_live_events(text);

begin;

-- Newest first, up to 60. p_query: words in the name, the first course or a trip's location (empty = all).
create or replace function public.list_public_live_events(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as words),
  events as (
    select 'trip'::text as kind, g.name, g.watch_code, g.start_date as first_date, g.end_date as last_date,
      (g.status = 'completed') as ended,
      (select r.course_name from golf_trip_rounds r where r.golf_trip_id = g.id and coalesce(btrim(r.course_name), '') <> '' order by r.round_number limit 1) as course,
      (select count(*) from golf_trip_members m where m.golf_trip_id = g.id and m.invitation_status = 'accepted') as players,
      nullif(btrim(g.destination), '') as place,
      g.created_at
    from golf_trips g where g.live_visibility = 'public'
    union all
    select 'tournament', t.name, t.watch_code,
      (select min(r.round_date) from code_tournament_rounds r where r.tournament_id = t.id),
      (select max(r.round_date) from code_tournament_rounds r where r.tournament_id = t.id),
      (t.status = 'ended'),
      (select r.setup #>> '{course,name}' from code_tournament_rounds r where r.tournament_id = t.id order by r.number limit 1),
      (select count(*) from code_tournament_players p where p.tournament_id = t.id),
      null::text,
      t.created_at
    from code_tournaments t where t.live_visibility = 'public'
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'name', e.name, 'code', e.watch_code, 'firstDate', e.first_date,
      'lastDate', e.last_date, 'ended', e.ended, 'course', e.course, 'place', e.place, 'playerCount', e.players) order by e.created_at desc), '[]'::jsonb)
  from (select * from events, q where q.words = '' or position(q.words in lower(events.name || ' ' || coalesce(events.course, '') || ' ' || coalesce(events.place, ''))) > 0
        order by events.created_at desc limit 60) e;
$$;

revoke all on function public.list_public_live_events(text) from public, anon, authenticated;
grant execute on function public.list_public_live_events(text) to service_role;

commit;
