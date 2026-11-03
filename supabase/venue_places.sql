-- supabase/venue_places.sql
-- Venue tab → place recommendations, phase 2 (project_specs.md "Venue tab → Places recommendations", owner 2026-11-02).
--
-- OUR OWN place database, built up over time:
--   * places               every place we know: from OpenStreetMap (source 'osm', © OpenStreetMap contributors, ODbL —
--                          storing it is allowed with that credit shown) or added by a person later (source 'user').
--   * place_area_fetches   when each ~5 km area + category was last looked up on OpenStreetMap (reused 30 days).
--   * place_saves          hearts: a person saved a place for a trip ("Your group saved this").
--   * place_trip_adds      a place put on a trip's itinerary ("Added by N trips").
--   * place_ratings        after-visit 1-10 ratings ("Ranked highly by Maroon users": average 8+ from at least 5).
-- Saves / adds / ratings are written in phase 3 and 4; the tables are created now so the data model is settled.
--
-- History rule (owner, 2026-10-01): deleting a trip or an account never wipes the community's history. Adds and ratings
-- keep counting after their trip is deleted (trip_id → null); a deleted account's ratings stay, unlinked (profile_id →
-- null). Only a trip's own hearts (planning) go with the trip.
--
-- Access: like golf_trips.sql — no direct reads/writes from browsers; the server calls these functions with the
-- service-role key, passing the signed-in person's profile id (lib/platform/venuePlacesServer.ts).
--
-- Prerequisites: golf_trips.sql. Safe to run more than once. Changes no existing rows. Undo: see the bottom.

begin;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('osm', 'user')),
  source_id text not null check (length(source_id) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (category in ('food', 'bars', 'golf', 'coffee', 'todo')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  area_key text not null check (area_key ~ '^-?[0-9]{1,3}\.[0-9]{2},-?[0-9]{1,3}\.[0-9]{2}$'),
  address text check (address is null or length(address) <= 200),
  detail text check (detail is null or length(detail) <= 120),
  website text check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  phone text check (phone is null or length(phone) <= 40),
  opening_hours text check (opening_hours is null or length(opening_hours) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists places_area_category_idx on public.places (area_key, category);

create table if not exists public.place_area_fetches (
  area_key text not null,
  category text not null check (category in ('food', 'bars', 'golf', 'coffee', 'todo')),
  fetched_at timestamptz not null default now(),
  place_count integer not null default 0 check (place_count >= 0),
  primary key (area_key, category)
);

create table if not exists public.place_saves (
  place_id uuid not null references public.places(id) on delete cascade,
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (place_id, golf_trip_id, profile_id)
);
create index if not exists place_saves_trip_idx on public.place_saves (golf_trip_id);

create table if not exists public.place_trip_adds (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  golf_trip_id uuid references public.golf_trips(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists place_trip_adds_once_idx on public.place_trip_adds (place_id, golf_trip_id) where golf_trip_id is not null;
create index if not exists place_trip_adds_place_idx on public.place_trip_adds (place_id);

create table if not exists public.place_ratings (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  golf_trip_id uuid references public.golf_trips(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  rating integer not null check (rating between 1 and 10),
  visited_on date not null,
  created_at timestamptz not null default now()
);
-- One rating per person, place and trip (asked once per place).
create unique index if not exists place_ratings_once_idx on public.place_ratings (place_id, profile_id, golf_trip_id)
  where profile_id is not null and golf_trip_id is not null;
create index if not exists place_ratings_place_idx on public.place_ratings (place_id);

alter table public.places enable row level security;
alter table public.place_area_fetches enable row level security;
alter table public.place_saves enable row level security;
alter table public.place_trip_adds enable row level security;
alter table public.place_ratings enable row level security;
revoke all on public.places, public.place_area_fetches, public.place_saves, public.place_trip_adds, public.place_ratings
  from public, anon, authenticated;

-- When an area + category was last looked up (null = never).
create or replace function public.place_area_fetched_at(p_area text, p_category text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select fetched_at from place_area_fetches where area_key = p_area and category = p_category;
$$;

-- Store one OpenStreetMap lookup: upsert each place (by its OSM id) and record the lookup time. p_places is a JSON
-- array of { sourceId, name, latitude, longitude, address, detail, website, phone, openingHours } (already cleaned by
-- lib/platform/osmPlaces.ts; the table checks are the last word). Returns how many places were stored.
create or replace function public.store_osm_places(p_area text, p_category text, p_places jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  if p_area !~ '^-?[0-9]{1,3}\.[0-9]{2},-?[0-9]{1,3}\.[0-9]{2}$' then raise exception 'Bad area.' using errcode = '22023'; end if;
  if p_category not in ('food', 'bars', 'golf', 'coffee', 'todo') then raise exception 'Bad category.' using errcode = '22023'; end if;
  if jsonb_typeof(p_places) <> 'array' then raise exception 'Places must be a list.' using errcode = '22023'; end if;

  insert into places (source, source_id, name, category, latitude, longitude, area_key, address, detail, website, phone, opening_hours)
  select 'osm', p ->> 'sourceId', p ->> 'name', p_category, (p ->> 'latitude')::double precision, (p ->> 'longitude')::double precision,
         p_area, nullif(p ->> 'address', ''), nullif(p ->> 'detail', ''), nullif(p ->> 'website', ''), nullif(p ->> 'phone', ''), nullif(p ->> 'openingHours', '')
  from jsonb_array_elements(p_places) p
  where p ->> 'sourceId' ~ '^(node|way|relation)/[0-9]+$' and length(trim(coalesce(p ->> 'name', ''))) > 0
  on conflict (source, source_id) do update set
    name = excluded.name, category = excluded.category, latitude = excluded.latitude, longitude = excluded.longitude,
    area_key = excluded.area_key, address = excluded.address, detail = excluded.detail, website = excluded.website,
    phone = excluded.phone, opening_hours = excluded.opening_hours, updated_at = now();
  get diagnostics v_count = row_count;

  insert into place_area_fetches (area_key, category, fetched_at, place_count) values (p_area, p_category, now(), v_count)
  on conflict (area_key, category) do update set fetched_at = now(), place_count = excluded.place_count;
  return v_count;
end;
$$;

-- A trip's places in its area (one category, or all when p_category is null), each with our own numbers. Only an
-- accepted member of the trip gets anything; everyone else gets an empty list.
create or replace function public.list_trip_places(p_profile uuid, p_trip uuid, p_area text, p_category text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'category', p.category, 'latitude', p.latitude, 'longitude', p.longitude,
      'address', p.address, 'detail', p.detail, 'website', p.website, 'phone', p.phone, 'openingHours', p.opening_hours,
      'source', p.source,
      'tripAdds', (select count(distinct a.golf_trip_id) from place_trip_adds a where a.place_id = p.id and a.golf_trip_id is not null)
        + (select count(*) from place_trip_adds a where a.place_id = p.id and a.golf_trip_id is null),
      'savedByGroup', exists (select 1 from place_saves s where s.place_id = p.id and s.golf_trip_id = p_trip),
      'savedByMe', exists (select 1 from place_saves s where s.place_id = p.id and s.golf_trip_id = p_trip and s.profile_id = p_profile),
      'ratingAverage', (select round(avg(r.rating)::numeric, 1) from place_ratings r where r.place_id = p.id),
      'ratingCount', (select count(*) from place_ratings r where r.place_id = p.id)
    ) order by p.name), '[]'::jsonb)
  from places p
  where p.area_key = p_area and (p_category is null or p.category = p_category)
    and exists (select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = p_profile and m.invitation_status = 'accepted');
$$;

revoke all on function public.place_area_fetched_at(text, text), public.store_osm_places(text, text, jsonb),
  public.list_trip_places(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.place_area_fetched_at(text, text), public.store_osm_places(text, text, jsonb),
  public.list_trip_places(uuid, uuid, text, text) to service_role;

commit;

-- Undo (development only):
--   drop function public.list_trip_places(uuid, uuid, text, text), public.store_osm_places(text, text, jsonb),
--     public.place_area_fetched_at(text, text);
--   drop table public.place_ratings, public.place_trip_adds, public.place_saves, public.place_area_fetches, public.places;
