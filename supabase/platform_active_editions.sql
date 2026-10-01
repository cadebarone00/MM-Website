-- supabase/platform_active_editions.sql
-- My Profile page (/profile), "Active" tournaments: the editions the
-- signed-in person is on the roster of whose last day (end date, else start
-- date) is today or later in the edition's own timezone. Editions with no
-- dates yet count as active. Same other filters as list_my_past_editions
-- (platform_past_editions.sql): test seasons are left out, and customer
-- tournaments only appear once published; the founding (legacy) tournament
-- is kept because it has its own site.
--
-- Returns only display fields (no ids, emails or handicaps). Called only by
-- the server (service role) with the session's user id.
--
-- Prerequisites: platform_foundation.sql. Safe to run more than once.

begin;

create or replace function public.list_my_active_editions(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', t.slug,
      'name', t.name,
      'isLegacy', t.is_legacy,
      'year', e.season_year,
      'destination', e.destination,
      'startDate', e.start_date,
      'endDate', e.end_date
    ) order by e.start_date asc nulls last, t.name), '[]'::jsonb)
  from tournament_editions e
  join tournaments t on t.id = e.tournament_id
  where not e.is_test
    and (t.is_legacy or e.published_at is not null)
    and (coalesce(e.end_date, e.start_date) is null
      or coalesce(e.end_date, e.start_date) >= (now() at time zone e.timezone)::date)
    and exists (
      select 1 from edition_roster r
      join tournament_players p on p.id = r.tournament_player_id
      where r.edition_id = e.id and p.profile_id = p_profile
    );
$fn$;

revoke all on function public.list_my_active_editions(uuid) from public, anon, authenticated;
grant execute on function public.list_my_active_editions(uuid) to service_role;

commit;
