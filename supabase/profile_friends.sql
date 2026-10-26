-- supabase/profile_friends.sql
-- Find Golfers and friend requests (Profile → magnifying glass). Anyone signed in can search golfers by name or
-- @username and ask to be friends; the other golfer accepts or declines. An accepted request makes them friends, on
-- top of the automatic friends from golf trips (lib/profile/friendsServer.ts). Asking someone who already asked you
-- accepts theirs.
--
-- Access: nobody reads or writes the table directly (RLS on, no policies). The server calls the functions below with
-- the signed-in user's profile id, using the service-role key (lib/profile/friendRequestsServer.ts). Search shows a
-- golfer's name, @username and photo only (a Private profile shows other people its name only anyway).
--
-- Prerequisites: schema.sql (profiles), profile_photos.sql, account_deletion.sql. Safe to run more than once.
-- Undo: drop table public.profile_friend_requests; drop function public.search_golfers(uuid, text),
--       public.send_friend_request(uuid, uuid), public.respond_friend_request(uuid, uuid, boolean), public.my_friend_requests(uuid);

begin;

create table if not exists public.profile_friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_profile, to_profile),
  check (from_profile <> to_profile)
);
create index if not exists profile_friend_requests_to_idx on public.profile_friend_requests (to_profile, status);
alter table public.profile_friend_requests enable row level security;
revoke all on public.profile_friend_requests from public, anon, authenticated;

-- Up to 25 golfers whose name or @username has the words in it (not me, not closed accounts), with where we stand:
-- "friends", "requested" (I asked), "incoming" (they asked me) or "none". Trip friends are worked out by the server.
create or replace function public.search_golfers(p_viewer uuid, p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'username', p.username, 'avatarPath', p.avatar_path,
    'relation', case
      when exists (select 1 from profile_friend_requests r where r.status = 'accepted' and ((r.from_profile = p_viewer and r.to_profile = p.id) or (r.from_profile = p.id and r.to_profile = p_viewer))) then 'friends'
      when exists (select 1 from profile_friend_requests r where r.status = 'pending' and r.from_profile = p_viewer and r.to_profile = p.id) then 'requested'
      when exists (select 1 from profile_friend_requests r where r.status = 'pending' and r.from_profile = p.id and r.to_profile = p_viewer) then 'incoming'
      else 'none' end) order by p.display_name), '[]'::jsonb)
  from (select * from profiles x
        where x.id <> p_viewer and x.deleted_at is null and x.display_name is not null and length(btrim(coalesce(p_query, ''))) >= 2
          and (position(lower(btrim(p_query)) in lower(x.display_name)) > 0 or position(lower(ltrim(btrim(p_query), '@')) in lower(coalesce(x.username, ''))) > 0)
        order by x.display_name limit 25) p;
$$;

-- I ask `p_to` to be friends. If they already asked me, that request is accepted instead. Returns the new relation.
create or replace function public.send_friend_request(p_from uuid, p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_from = p_to then raise exception 'That''s you.' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_to and deleted_at is null) then raise exception 'That golfer isn''t on The Maroon.' using errcode = '22023'; end if;
  if exists (select 1 from profile_friend_requests where from_profile = p_to and to_profile = p_from and status = 'pending') then
    update profile_friend_requests set status = 'accepted', responded_at = now() where from_profile = p_to and to_profile = p_from;
    return 'friends';
  end if;
  if exists (select 1 from profile_friend_requests where status = 'accepted' and ((from_profile = p_from and to_profile = p_to) or (from_profile = p_to and to_profile = p_from))) then
    return 'friends';
  end if;
  insert into profile_friend_requests (from_profile, to_profile) values (p_from, p_to)
  on conflict (from_profile, to_profile) do update set status = 'pending', created_at = now(), responded_at = null;
  return 'requested';
end $$;

-- The golfer a request was sent to accepts or declines it.
create or replace function public.respond_friend_request(p_me uuid, p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profile_friend_requests set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_request and to_profile = p_me and status = 'pending';
  if not found then raise exception 'That request isn''t waiting on you any more.' using errcode = '22023'; end if;
end $$;

-- Requests waiting on me (newest first), and my accepted friends from requests (ids, for the friend count).
create or replace function public.my_friend_requests(p_me uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'profileId', p.id, 'name', p.display_name, 'username', p.username, 'avatarPath', p.avatar_path) order by r.created_at desc), '[]'::jsonb)
                 from profile_friend_requests r join profiles p on p.id = r.from_profile where r.to_profile = p_me and r.status = 'pending' and p.deleted_at is null),
    'friends', (select coalesce(jsonb_agg(case when r.from_profile = p_me then r.to_profile else r.from_profile end), '[]'::jsonb)
                from profile_friend_requests r where r.status = 'accepted' and (r.from_profile = p_me or r.to_profile = p_me)));
$$;

do $$
declare f text;
begin
  foreach f in array array['search_golfers(uuid, text)', 'send_friend_request(uuid, uuid)', 'respond_friend_request(uuid, uuid, boolean)', 'my_friend_requests(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
