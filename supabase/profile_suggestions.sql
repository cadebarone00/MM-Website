-- supabase/profile_suggestions.sql
-- Search page → "Suggested for you" (project_specs.md "Instagram-style Search page", 2026-11-19). READ-ONLY: creates two
-- functions, changes no table and no row.
--   profile_friend_ids(p)          everyone p is friends with: accepted friend requests + golf-trip mates (both accepted
--                                  members of the same trip) — the same rule as lib/profile/friendsServer.ts friendIds
--   suggest_golfers(viewer, limit) people you may know first (friends of your friends, most mutual friends first), then
--                                  random golfers to fill up. Never you, your friends, anyone you've already asked or who
--                                  asked you, closed accounts, Pending accounts, or profiles without a name / username.
-- Prerequisites: golf_trips.sql, profile_friends.sql. Safe to run more than once.
-- Access: the server only (service-role key); the viewer id always comes from the signed-in session.

create or replace function public.profile_friend_ids(p_profile uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select case when r.from_profile = p_profile then r.to_profile else r.from_profile end
    from profile_friend_requests r
    where r.status = 'accepted' and p_profile in (r.from_profile, r.to_profile)
  union
  select other.profile_id
    from golf_trip_members mine
    join golf_trip_members other on other.golf_trip_id = mine.golf_trip_id
    where mine.profile_id = p_profile and mine.invitation_status = 'accepted'
      and other.invitation_status = 'accepted' and other.profile_id is not null and other.profile_id <> p_profile;
$$;

-- [{ id, name, username, avatarPath, mutuals }] — mutuals = how many of your friends are their friends (0 = random fill).
create or replace function public.suggest_golfers(p_viewer uuid, p_limit integer default 12)
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (select profile_friend_ids(p_viewer) as id),
  asked as (
    select case when from_profile = p_viewer then to_profile else from_profile end as id
    from profile_friend_requests where status = 'pending' and p_viewer in (from_profile, to_profile)
  ),
  allowed as (
    select x.id, x.display_name, x.username, x.avatar_path from profiles x
    where x.id <> p_viewer and x.deleted_at is null and x.display_name is not null and x.username is not null
      -- Pending accounts are never discoverable (same rule as search_golfers): only where activation is installed.
      and (not (to_jsonb(x) ? 'activated_at') or to_jsonb(x) ->> 'activated_at' is not null)
      and x.id not in (select id from mine) and x.id not in (select id from asked)
  ),
  mutual as (
    select f.id, count(*) as n from mine m cross join lateral profile_friend_ids(m.id) as f(id) group by f.id
  ),
  ranked as (
    select a.*, coalesce(mu.n, 0) as mutuals, random() as shuffle from allowed a left join mutual mu on mu.id = a.id
    order by coalesce(mu.n, 0) desc, random()
    limit greatest(1, least(coalesce(p_limit, 12), 30))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'username', username, 'avatarPath', avatar_path, 'mutuals', mutuals)
    order by mutuals desc, shuffle), '[]'::jsonb) from ranked;
$$;

revoke all on function public.profile_friend_ids(uuid) from public, anon, authenticated;
revoke all on function public.suggest_golfers(uuid, integer) from public, anon, authenticated;
grant execute on function public.profile_friend_ids(uuid), public.suggest_golfers(uuid, integer) to service_role;

-- Undo: drop function if exists public.suggest_golfers(uuid, integer), public.profile_friend_ids(uuid);
