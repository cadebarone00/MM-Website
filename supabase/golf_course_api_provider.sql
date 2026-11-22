-- supabase/golf_course_api_provider.sql
-- Course library: switch from OpenGolfAPI to GolfCourseAPI (owner decision 2026-11-21: GolfCourseAPI is the only course
-- source; OpenGolfAPI is removed from the app).
--
-- What it does, in plain words:
--   1. Deletes the courses that were saved from OpenGolf while testing GPS (8 in production on 2026-11-21). No trip or
--      round points at them; the app re-saves a course from GolfCourseAPI the next time someone prepares its GPS.
--   2. Lets the course library store courses from 'golf_course_api' (and no longer from 'open_golf').
--   3. Treats GolfCourseAPI scorecards (license 'GolfCourseAPI-terms') like open data in the refresh rule, so a saved
--      course can be rebuilt when its GPS data is refreshed. Admin-verified / professional data stays protected.
--
-- Prerequisite: supabase/golf_course_data.sql. Safe to run more than once.
-- Undo: there is no going back to OpenGolf (its code is gone); re-running golf_course_data.sql does not undo this.

begin;

-- 1. Old OpenGolf test courses. Deleting a course removes its holes, tees, shapes and green targets with it.
delete from public.golf_courses c
where exists (select 1 from public.golf_course_external_ids e where e.course_id = c.id and e.provider = 'open_golf')
   or exists (select 1 from public.golf_course_sources s where s.course_id = c.id and s.provider = 'open_golf');

-- 2. Which providers the library accepts.
alter table public.golf_course_external_ids drop constraint if exists golf_course_external_ids_provider_check;
alter table public.golf_course_external_ids add constraint golf_course_external_ids_provider_check
  check (provider in ('maroon', 'golf_course_api', 'openstreetmap', 'golf_intelligence'));
alter table public.golf_course_sources drop constraint if exists golf_course_sources_provider_check;
alter table public.golf_course_sources add constraint golf_course_sources_provider_check
  check (provider in ('maroon', 'golf_course_api', 'openstreetmap', 'golf_intelligence'));

-- 3. Refresh rule (same as supabase/golf_course_data.sql).
create or replace function public.golf_course_has_protected_data(p_course uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from golf_courses where id = p_course and verification->>'status' in ('admin_verified', 'professional_source'))
    or exists (select 1 from golf_holes where course_id = p_course and verification->>'status' in ('admin_verified', 'professional_source'))
    or exists (select 1 from golf_course_external_ids where course_id = p_course and provider not in ('golf_course_api', 'openstreetmap'))
    or exists (select 1 from golf_holes h, jsonb_array_elements(coalesce(h.sources, '[]'::jsonb) || coalesce(h.external_ids, '[]'::jsonb)) e
      where h.course_id = p_course and coalesce(e->>'provider', '') not in ('golf_course_api', 'openstreetmap'))
    or exists (select 1 from golf_course_sources where course_id = p_course and license not in ('ODbL-1.0', 'GolfCourseAPI-terms'))
    or exists (select 1 from golf_tee_sets where course_id = p_course and license not in ('ODbL-1.0', 'GolfCourseAPI-terms'))
    or exists (select 1 from golf_hole_tees t join golf_holes h on h.id = t.hole_id where h.course_id = p_course and t.license not in ('ODbL-1.0', 'GolfCourseAPI-terms'))
    or exists (select 1 from golf_hole_features f join golf_holes h on h.id = f.hole_id where h.course_id = p_course and f.license not in ('ODbL-1.0', 'GolfCourseAPI-terms'))
    or exists (select 1 from golf_green_targets g join golf_holes h on h.id = g.hole_id where h.course_id = p_course and g.license not in ('ODbL-1.0', 'GolfCourseAPI-terms'));
$$;
revoke all on function public.golf_course_has_protected_data(uuid) from public, anon, authenticated;
grant execute on function public.golf_course_has_protected_data(uuid) to service_role;

commit;
