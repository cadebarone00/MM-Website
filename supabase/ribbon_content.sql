-- supabase/ribbon_content.sql — Play page ribbon content (spec: project_specs.md → "Play page ribbon content").
-- Additive and re-runnable; touches no existing table. Requires platform_foundation.sql (profiles.platform_role).
-- NOT run in production or staging yet.
--
-- ribbon_content: posts and weekly trip plans. Photos and videos live in R2 under ribbon/<id>/; only their URLs are here.
-- content_team: invited and active Posters, plus one-time invite links (profile_id is null until someone uses the link;
-- only the link's hash is stored). Admins are profiles.platform_role = 'admin', set by hand, and never appear here.
--
-- Security: RLS is on. The public can read live items only. Every write and every team read goes through API routes that
-- check the caller's role on the server (lib/content/ribbonServer.ts) and use the service role.

begin;

create table if not exists public.ribbon_content (
  id uuid primary key,
  kind text not null check (kind in ('post', 'trip_plan')),
  tab text not null check (tab in ('Explore', 'Courses', 'Equipment', 'Teaching', 'News')),
  format text check (format in ('story', 'quick')),
  title text not null default '',
  summary text not null default '',
  cover_image_url text not null default '',
  cover_video_url text,
  body jsonb not null default '[]'::jsonb, -- posts: the list of blocks. Trip plans: the featured trip.
  status text not null default 'draft' check (status in ('draft', 'pending', 'changes_requested', 'published')),
  publish_at timestamptz,
  review_note text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null, -- never shown; a deleted account's posts stay up
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ribbon_content_published_has_date check (status <> 'published' or publish_at is not null),
  constraint ribbon_content_trip_on_explore check (kind <> 'trip_plan' or tab = 'Explore'),
  constraint ribbon_content_post_has_format check (kind <> 'post' or format is not null)
);

create index if not exists ribbon_content_live_idx on public.ribbon_content (publish_at desc) where status = 'published';
create index if not exists ribbon_content_author_idx on public.ribbon_content (created_by);

create table if not exists public.content_team (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  role text not null default 'poster' check (role = 'poster'),
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  invite_token_hash text unique,
  expires_at timestamptz,
  constraint content_team_person_or_link check (
    (profile_id is not null and invite_token_hash is null and expires_at is null)
    or (profile_id is null and invite_token_hash is not null and expires_at is not null and status = 'invited')
  )
);

alter table public.ribbon_content enable row level security;
alter table public.content_team enable row level security;

revoke all on public.ribbon_content from anon, authenticated;
revoke all on public.content_team from anon, authenticated;
grant select on public.ribbon_content to anon, authenticated;
grant all on public.ribbon_content to service_role;
grant all on public.content_team to service_role;

drop policy if exists ribbon_content_public_read on public.ribbon_content;
create policy ribbon_content_public_read on public.ribbon_content for select to anon, authenticated
  using (status = 'published' and publish_at <= now());

commit;
