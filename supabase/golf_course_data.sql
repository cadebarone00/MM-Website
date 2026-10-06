-- supabase/golf_course_data.sql
-- Course-data library for on-course GPS: The Maroon's own normalized copy of golf courses (lib/platform/golfGps/domain),
-- built from open data — OpenGolfAPI scorecards + OpenStreetMap geometry — plus green targets The Maroon derived from it.
-- Shared reference data: a course is stored once and reused, instead of calling OpenGolf / Overpass on every load.
--
-- Separate from live_courses on purpose: live_courses holds the courses organizers type in for live scoring (Maroon's
-- own data). Everything here is imported open data under the ODbL (share-alike), so it lives in its own tables where
-- every row says where it came from and under which license.
--
-- Provenance, by design:
--   * every course / tee / geometry row has `provider` (+ `provider_record_id`) and `license`;
--   * raw shapes (golf_hole_features: green outline, fairways, bunkers, …) never hold derived values;
--   * Maroon-derived green front / center / back live in golf_green_targets with their derivation (method, inputs,
--     derivedAt, derivedBy = 'maroon') — never mixed into the raw green outline;
--   * future proprietary data (e.g. a paid provider, admin corrections) gets its own provider + license, and
--     save_golf_course refuses to overwrite a course that holds any — see "Refresh rule" below.
--
-- Geometry is stored as JSONB (the domain shape, e.g. {"coordinates":[{"lat":..,"lng":..}], "source":{...}}): exact
-- coordinates, no PostGIS needed. Course latitude / longitude are plain columns so a PostGIS geography column or a
-- "nearby courses" index can be added later without reshaping anything.
--
-- Access: no browser access at all. RLS is on with no policies; reads and writes go through the functions below,
-- which only the server's service-role key may call (lib/platform/golfGps/repository/supabaseCourseStore.ts). In this
-- step only the dev tools call save_golf_course.
--
-- Refresh rule: save_golf_course replaces a stored course only while everything in it is imported open data (license
-- 'ODbL-1.0') and nothing is admin-verified / professional. Otherwise it raises golf_course_has_protected_data and
-- changes nothing — merging imports into protected data is a later step.
--
-- Prerequisite: none. Safe to run more than once. Undo: see the bottom of this file.

begin;

create table if not exists public.golf_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  facility_name text,
  address jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  timezone text,
  hole_count integer not null check (hole_count between 0 and 72),
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  coverage jsonb not null,
  coverage_level text not null check (coverage_level in ('scorecard', 'gps', 'mapped', 'verified', 'premium')),
  verification jsonb not null check (coalesce(verification->>'status', '') in ('unverified', 'imported', 'community_submitted', 'admin_verified', 'professional_source')),
  -- When the source data was first imported, and when this row was last rebuilt from the sources.
  imported_at timestamptz,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

-- One provider id per row; a provider id can belong to only one Maroon course.
create table if not exists public.golf_course_external_ids (
  course_id uuid not null references public.golf_courses(id) on delete cascade,
  position integer not null,
  provider text not null check (provider in ('maroon', 'open_golf', 'openstreetmap', 'golf_intelligence')),
  external_id text not null check (length(external_id) between 1 and 200),
  primary key (provider, external_id)
);
create index if not exists golf_course_external_ids_course_idx on public.golf_course_external_ids (course_id);

-- Course-level sources (OpenGolf scorecard, the matched OpenStreetMap course, …) with their credit line.
create table if not exists public.golf_course_sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.golf_courses(id) on delete cascade,
  position integer not null,
  provider text not null check (provider in ('maroon', 'open_golf', 'openstreetmap', 'golf_intelligence')),
  provider_record_id text,
  imported_at timestamptz,
  last_updated_at timestamptz,
  confidence numeric check (confidence between 0 and 1),
  attribution text,
  license text not null
);
create index if not exists golf_course_sources_course_idx on public.golf_course_sources (course_id, position);

create table if not exists public.golf_tee_sets (
  course_id uuid not null references public.golf_courses(id) on delete cascade,
  key text not null,
  position integer not null,
  name text not null,
  color text,
  total_yards integer check (total_yards > 0),
  par integer check (par > 0),
  ratings jsonb check (ratings is null or jsonb_typeof(ratings) = 'array'),
  provider text,
  license text not null,
  primary key (course_id, key)
);

create table if not exists public.golf_holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.golf_courses(id) on delete cascade,
  number integer not null check (number between 1 and 72),
  par integer not null check (par between 2 and 7),
  stroke_index integer check (stroke_index between 1 and 72),
  external_ids jsonb,
  sources jsonb,
  coverage jsonb not null,
  coverage_level text not null check (coverage_level in ('scorecard', 'gps', 'mapped', 'verified', 'premium')),
  verification jsonb not null check (coalesce(verification->>'status', '') in ('unverified', 'imported', 'community_submitted', 'admin_verified', 'professional_source')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, number)
);

-- Tees on a hole: scorecard yardage (OpenGolf, tied to a tee set) and/or a mapped tee box (OSM, location only).
create table if not exists public.golf_hole_tees (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references public.golf_holes(id) on delete cascade,
  position integer not null,
  key text not null,
  tee_set_key text,
  name text not null,
  color text,
  yardage integer check (yardage > 0),
  par integer check (par between 2 and 7),
  stroke_index integer check (stroke_index between 1 and 72),
  location jsonb,
  provider text,
  provider_record_id text,
  license text not null,
  unique (hole_id, key)
);

-- Raw mapped shapes, exactly as the provider gave them (one row per shape). Never derived values.
create table if not exists public.golf_hole_features (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references public.golf_holes(id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('green', 'fairway', 'bunker', 'penalty_area', 'boundary', 'centerline')),
  key text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  provider text,
  provider_record_id text,
  license text not null,
  unique (hole_id, kind, key)
);

-- Green front / center / back worked out by The Maroon from the raw shapes. Every stored point must carry its
-- derivation (derivedBy = 'maroon', method, inputs). Points a provider supplies directly would need their own provider
-- columns, so they're refused here for now rather than stored without a source.
create table if not exists public.golf_green_targets (
  hole_id uuid primary key references public.golf_holes(id) on delete cascade,
  center jsonb not null,
  front jsonb,
  back jsonb,
  center_derivation jsonb,
  front_back_derivation jsonb,
  license text not null,
  check ((front is null) = (back is null)),
  check (center_derivation is not null and center_derivation->>'derivedBy' = 'maroon'),
  check (front is null or (front_back_derivation is not null and front_back_derivation->>'derivedBy' = 'maroon')),
  check (front_back_derivation is null or front is not null)
);

alter table public.golf_courses enable row level security;
alter table public.golf_course_external_ids enable row level security;
alter table public.golf_course_sources enable row level security;
alter table public.golf_tee_sets enable row level security;
alter table public.golf_holes enable row level security;
alter table public.golf_hole_tees enable row level security;
alter table public.golf_hole_features enable row level security;
alter table public.golf_green_targets enable row level security;
revoke all on public.golf_courses, public.golf_course_external_ids, public.golf_course_sources, public.golf_tee_sets,
  public.golf_holes, public.golf_hole_tees, public.golf_hole_features, public.golf_green_targets from anon, authenticated;

-- The Maroon course that has this provider id, or null.
create or replace function public.find_golf_course_id(p_provider text, p_external_id text)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select course_id from golf_course_external_ids where provider = p_provider and external_id = p_external_id;
$$;

-- One stored course with everything under it, in saved order, or null when there's no such course.
create or replace function public.get_golf_course(p_course uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'course', to_jsonb(c),
    'external_ids', coalesce((select jsonb_agg(jsonb_build_object('provider', e.provider, 'id', e.external_id) order by e.position)
      from golf_course_external_ids e where e.course_id = c.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from golf_course_sources s where s.course_id = c.id), '[]'::jsonb),
    'tee_sets', coalesce((select jsonb_agg(to_jsonb(t) order by t.position) from golf_tee_sets t where t.course_id = c.id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(to_jsonb(h) || jsonb_build_object(
        'tees', coalesce((select jsonb_agg(to_jsonb(ht) order by ht.position) from golf_hole_tees ht where ht.hole_id = h.id), '[]'::jsonb),
        'features', coalesce((select jsonb_agg(to_jsonb(f) order by f.position) from golf_hole_features f where f.hole_id = h.id), '[]'::jsonb),
        'targets', (select to_jsonb(g) from golf_green_targets g where g.hole_id = h.id)
      ) order by h.number) from golf_holes h where h.course_id = c.id), '[]'::jsonb)
  )
  from golf_courses c where c.id = p_course;
$$;

-- True when a stored course holds anything a refresh must not overwrite (see "Refresh rule" at the top).
create or replace function public.golf_course_has_protected_data(p_course uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from golf_courses where id = p_course and verification->>'status' in ('admin_verified', 'professional_source'))
    or exists (select 1 from golf_holes where course_id = p_course and verification->>'status' in ('admin_verified', 'professional_source'))
    or exists (select 1 from golf_course_external_ids where course_id = p_course and provider not in ('open_golf', 'openstreetmap'))
    or exists (select 1 from golf_holes h, jsonb_array_elements(coalesce(h.sources, '[]'::jsonb) || coalesce(h.external_ids, '[]'::jsonb)) e
      where h.course_id = p_course and coalesce(e->>'provider', '') not in ('open_golf', 'openstreetmap'))
    or exists (select 1 from golf_course_sources where course_id = p_course and license <> 'ODbL-1.0')
    or exists (select 1 from golf_tee_sets where course_id = p_course and license <> 'ODbL-1.0')
    or exists (select 1 from golf_hole_tees t join golf_holes h on h.id = t.hole_id where h.course_id = p_course and t.license <> 'ODbL-1.0')
    or exists (select 1 from golf_hole_features f join golf_holes h on h.id = f.hole_id where h.course_id = p_course and f.license <> 'ODbL-1.0')
    or exists (select 1 from golf_green_targets g join golf_holes h on h.id = g.hole_id where h.course_id = p_course and g.license <> 'ODbL-1.0');
$$;

-- Save a whole normalized course (shape: lib/platform/golfGps/repository/storageRows.ts). Finds an existing course by
-- any of its external ids and rebuilds it in place — the course id and each hole's id (by hole number) stay the same —
-- or creates it. All-or-nothing: any error leaves the stored course exactly as it was. Returns the course id.
create or replace function public.save_golf_course(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_course uuid;
  v_other uuid;
  v_hole uuid;
  v_c jsonb := p_payload->'course';
  h jsonb;
  x jsonb;
begin
  if v_c is null or jsonb_typeof(p_payload->'external_ids') <> 'array' or jsonb_array_length(p_payload->'external_ids') = 0 then
    raise exception 'golf_course_payload_invalid';
  end if;

  -- Which stored course is this? Every external id must point at the same one (or none).
  for x in select * from jsonb_array_elements(p_payload->'external_ids') loop
    v_other := find_golf_course_id(x->>'provider', x->>'id');
    if v_other is not null then
      if v_course is not null and v_course <> v_other then raise exception 'golf_course_external_id_taken'; end if;
      v_course := v_other;
    end if;
  end loop;

  if v_course is not null then
    perform 1 from golf_courses where id = v_course for update;
  end if;
  if v_course is not null and golf_course_has_protected_data(v_course) then
    raise exception 'golf_course_has_protected_data';
  end if;

  if v_course is null then
    insert into golf_courses (name, hole_count, coverage, coverage_level, verification)
    values (v_c->>'name', (v_c->>'hole_count')::integer, v_c->'coverage', v_c->>'coverage_level', v_c->'verification')
    returning id into v_course;
  end if;

  update golf_courses set
    name = v_c->>'name',
    facility_name = v_c->>'facility_name',
    address = coalesce(v_c->'address', '{}'::jsonb),
    latitude = (v_c->>'latitude')::double precision,
    longitude = (v_c->>'longitude')::double precision,
    timezone = v_c->>'timezone',
    hole_count = (v_c->>'hole_count')::integer,
    metadata = v_c->'metadata',
    coverage = v_c->'coverage',
    coverage_level = v_c->>'coverage_level',
    verification = v_c->'verification',
    imported_at = coalesce(imported_at, (v_c->>'imported_at')::timestamptz),
    refreshed_at = now(),
    updated_at = now()
  where id = v_course;

  delete from golf_course_external_ids where course_id = v_course;
  insert into golf_course_external_ids (course_id, position, provider, external_id)
    select v_course, e.ord, e.v->>'provider', e.v->>'id' from jsonb_array_elements(p_payload->'external_ids') with ordinality as e(v, ord);

  delete from golf_course_sources where course_id = v_course;
  insert into golf_course_sources (course_id, position, provider, provider_record_id, imported_at, last_updated_at, confidence, attribution, license)
    select v_course, s.ord, s.v->>'provider', s.v->>'provider_record_id', (s.v->>'imported_at')::timestamptz,
      (s.v->>'last_updated_at')::timestamptz, (s.v->>'confidence')::numeric, s.v->>'attribution', s.v->>'license'
    from jsonb_array_elements(coalesce(p_payload->'sources', '[]'::jsonb)) with ordinality as s(v, ord);

  delete from golf_tee_sets where course_id = v_course;
  insert into golf_tee_sets (course_id, key, position, name, color, total_yards, par, ratings, provider, license)
    select v_course, t.v->>'key', t.ord, t.v->>'name', t.v->>'color', (t.v->>'total_yards')::integer, (t.v->>'par')::integer,
      t.v->'ratings', t.v->>'provider', t.v->>'license'
    from jsonb_array_elements(coalesce(p_payload->'tee_sets', '[]'::jsonb)) with ordinality as t(v, ord);

  -- Holes keep their id across refreshes (matched by number); holes no longer in the payload are removed.
  delete from golf_holes where course_id = v_course
    and number not in (select (y->>'number')::integer from jsonb_array_elements(coalesce(p_payload->'holes', '[]'::jsonb)) y);

  for h in select * from jsonb_array_elements(coalesce(p_payload->'holes', '[]'::jsonb)) loop
    insert into golf_holes (course_id, number, par, stroke_index, external_ids, sources, coverage, coverage_level, verification)
    values (v_course, (h->>'number')::integer, (h->>'par')::integer, (h->>'stroke_index')::integer,
      h->'external_ids', h->'sources', h->'coverage', h->>'coverage_level', h->'verification')
    on conflict (course_id, number) do update set
      par = excluded.par, stroke_index = excluded.stroke_index, external_ids = excluded.external_ids, sources = excluded.sources,
      coverage = excluded.coverage, coverage_level = excluded.coverage_level, verification = excluded.verification, updated_at = now()
    returning id into v_hole;

    delete from golf_hole_tees where hole_id = v_hole;
    insert into golf_hole_tees (hole_id, position, key, tee_set_key, name, color, yardage, par, stroke_index, location, provider, provider_record_id, license)
      select v_hole, t.ord, t.v->>'key', t.v->>'tee_set_key', t.v->>'name', t.v->>'color', (t.v->>'yardage')::integer,
        (t.v->>'par')::integer, (t.v->>'stroke_index')::integer, t.v->'location', t.v->>'provider', t.v->>'provider_record_id', t.v->>'license'
      from jsonb_array_elements(coalesce(h->'tees', '[]'::jsonb)) with ordinality as t(v, ord);

    delete from golf_hole_features where hole_id = v_hole;
    insert into golf_hole_features (hole_id, position, kind, key, data, provider, provider_record_id, license)
      select v_hole, f.ord, f.v->>'kind', f.v->>'key', f.v->'data', f.v->>'provider', f.v->>'provider_record_id', f.v->>'license'
      from jsonb_array_elements(coalesce(h->'features', '[]'::jsonb)) with ordinality as f(v, ord);

    delete from golf_green_targets where hole_id = v_hole;
    if jsonb_typeof(h->'targets') = 'object' then
      insert into golf_green_targets (hole_id, center, front, back, center_derivation, front_back_derivation, license)
      values (v_hole, h->'targets'->'center', h->'targets'->'front', h->'targets'->'back',
        h->'targets'->'center_derivation', h->'targets'->'front_back_derivation', h->'targets'->>'license');
    end if;
  end loop;

  return v_course;
end;
$$;

revoke all on function public.find_golf_course_id(text, text) from public, anon, authenticated;
grant execute on function public.find_golf_course_id(text, text) to service_role;
revoke all on function public.get_golf_course(uuid) from public, anon, authenticated;
grant execute on function public.get_golf_course(uuid) to service_role;
revoke all on function public.golf_course_has_protected_data(uuid) from public, anon, authenticated;
grant execute on function public.golf_course_has_protected_data(uuid) to service_role;
revoke all on function public.save_golf_course(jsonb) from public, anon, authenticated;
grant execute on function public.save_golf_course(jsonb) to service_role;

commit;

-- Undo (deletes every stored course):
--   drop function if exists public.save_golf_course(jsonb);
--   drop function if exists public.golf_course_has_protected_data(uuid);
--   drop function if exists public.get_golf_course(uuid);
--   drop function if exists public.find_golf_course_id(text, text);
--   drop table if exists public.golf_green_targets, public.golf_hole_features, public.golf_hole_tees, public.golf_holes,
--     public.golf_tee_sets, public.golf_course_sources, public.golf_course_external_ids, public.golf_courses;
