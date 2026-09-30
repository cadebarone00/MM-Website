-- supabase/platform_activity.sql
-- Tournament activity (the "league feed" the Tournament Home will show):
-- commissioner announcements plus a few automatic, non-scoring events.
-- One table, one reader. Never touches live_* (live scoring) tables.
--
-- Activity types (tournament_activity_type_check):
--   now:      commissioner_announcement, tournament_published, schedule_updated,
--             players_updated, teams_updated
--   reserved for C4 (NOT accepted yet): pairings_posted, match_started, match_final,
--             team_score_changed, round_started, round_final, leaderboard_changed.
--   C4 adds them by replacing the named check constraint; readers already
--   ignore types they don't know (lib/platform/activity.ts).
--
-- Visibility: 'everyone' (whoever may see the tournament) or 'players_only'
-- (the tournament's players, organizers, owner and platform admins; not
-- 'viewer' members). The tournament's own visibility (public / unlisted /
-- private) and publish state are checked FIRST, exactly as the public site
-- does, by reusing get_public_tournament_years.
--
-- Called only by server routes with the service role.
-- Prerequisites: platform_foundation.sql, platform_dashboard.sql,
-- platform_public_site.sql. Safe to run more than once.

begin;

create table if not exists public.tournament_activity (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null,
  tournament_id uuid not null,
  activity_type text not null,
  -- Who caused it (the commissioner who posted/saved); null for system events or deleted accounts.
  actor_profile_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'everyone',
  title text check (title is null or length(trim(title)) between 1 and 120),
  body text check (body is null or length(trim(body)) between 1 and 2000),
  -- Non-personal details only (counts), e.g. {"added": 2, "removed": 1}.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  -- Pins the row to one tenant, like the other edition tables.
  foreign key (edition_id, tournament_id) references public.tournament_editions(id, tournament_id) on delete cascade,
  constraint tournament_activity_visibility_check check (visibility in ('everyone', 'players_only')),
  constraint tournament_activity_announcement_body check (activity_type <> 'commissioner_announcement' or body is not null)
);
alter table public.tournament_activity drop constraint if exists tournament_activity_type_check;
alter table public.tournament_activity add constraint tournament_activity_type_check check (activity_type in
  ('commissioner_announcement', 'tournament_published', 'schedule_updated', 'players_updated', 'teams_updated'));
create index if not exists tournament_activity_edition_idx on public.tournament_activity (edition_id, created_at desc);

alter table public.tournament_activity enable row level security;
revoke all on public.tournament_activity from public, anon, authenticated;
grant all on public.tournament_activity to service_role;

-- The feed for one edition, as this viewer may see it (null = not found,
-- identical for "doesn't exist" and "not allowed"). Who may open it:
--   * anyone the public site would serve (published, not test, visibility rules), or
--   * the edition's commissioners (owner/organizer) and platform admins, even before publishing.
-- Items get short refs (a1, a2 …) numbered within what this viewer can see,
-- never database ids. Author names are included only for members.
create or replace function public.get_tournament_activity(p_slug text, p_year integer, p_viewer uuid default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_t tournaments;
  v_e tournament_editions;
  v_manage boolean;
  v_admin boolean;
  v_role text;
  v_members boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  select * into v_t from tournaments where slug = p_slug and not is_legacy;
  if v_t.id is null then return null; end if;
  select * into v_e from tournament_editions where tournament_id = v_t.id and season_year = p_year and not is_test;
  if v_e.id is null then return null; end if;
  v_manage := p_viewer is not null and coalesce(can_manage_edition(p_viewer, v_e.id), false);
  if not (v_manage or p_year = any(get_public_tournament_years(p_slug, p_viewer))) then return null; end if;

  v_admin := coalesce((select platform_role = 'admin' from profiles where id = p_viewer), false);
  select role into v_role from tournament_members where tournament_id = v_t.id and profile_id = p_viewer;
  v_members := v_admin or coalesce(v_role in ('player', 'organizer', 'owner'), false);

  return jsonb_build_object(
    'published', v_e.published_at is not null,
    'viewer', jsonb_build_object('signedIn', p_viewer is not null, 'role', v_role, 'isPlatformAdmin', v_admin,
      'canPostAnnouncement', v_manage, 'canSeePlayersOnly', v_members),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('ref', 'a' || v.n, 'type', v.activity_type, 'visibility', v.visibility,
        'title', v.title, 'body', v.body, 'metadata', v.metadata, 'createdAt', v.created_at,
        'authorName', case when v_members then v.author end) order by v.n desc)
      from (
        select * from (
          select a.activity_type, a.visibility, a.title, a.body, a.metadata, a.created_at,
            row_number() over (order by a.created_at, a.id) n,
            (select coalesce(p.display_name, p.username) from profiles p where p.id = a.actor_profile_id) author
          from tournament_activity a
          where a.edition_id = v_e.id and (a.visibility = 'everyone' or v_members)
        ) numbered order by n desc limit v_limit
      ) v), '[]'::jsonb)
  );
end;
$fn$;

-- A commissioner announcement. Owners/organizers of the tournament and
-- platform admins only (can_manage_edition). Plain text; no media.
create or replace function public.post_commissioner_announcement(p_profile uuid, p_edition uuid, p_title text, p_body text, p_visibility text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_e tournament_editions;
  v_t tournaments;
begin
  if not coalesce(can_manage_edition(p_profile, p_edition), false) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  select * into v_e from tournament_editions where id = p_edition;
  select * into v_t from tournaments where id = v_e.tournament_id;
  if v_t.is_legacy or v_e.is_test then
    raise exception 'The Maroon Tournament is managed in the Admin Center.' using errcode = '42501';
  end if;
  if coalesce(p_visibility, '') not in ('everyone', 'players_only') then
    raise exception 'Choose who can see it.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 2000 or length(trim(coalesce(p_title, ''))) > 120 then
    raise exception 'Write a message (up to 2,000 characters) and an optional title (up to 120).' using errcode = '22023';
  end if;
  insert into tournament_activity (edition_id, tournament_id, activity_type, actor_profile_id, visibility, title, body)
  values (v_e.id, v_t.id, 'commissioner_announcement', p_profile, p_visibility, nullif(trim(coalesce(p_title, '')), ''), trim(p_body));
  return get_tournament_activity(v_t.slug, v_e.season_year, p_profile, 30);
end;
$fn$;

-- Automatic, non-scoring events, recorded by the save/publish routes after a
-- meaningful change (lib/platform/activity.ts setupActivityChanges decides
-- what counts). Kept quiet on purpose:
--   * nothing before the edition is published (setup churn isn't news);
--   * tournament_published only once per edition (unpublish/republish is silent);
--   * only whitelisted non-negative counts are stored; all-zero changes are dropped;
--   * a repeat of the latest event within 15 minutes is merged into it.
-- Returns true when something was recorded.
create or replace function public.record_edition_activity(p_profile uuid, p_edition uuid, p_type text, p_metadata jsonb)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare
  v_e tournament_editions;
  v_t tournaments;
  v_keys text[];
  v_meta jsonb := '{}'::jsonb;
  v_key text;
  v_value integer;
  v_last tournament_activity;
begin
  if not coalesce(can_manage_edition(p_profile, p_edition), false) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  v_keys := case p_type
    when 'tournament_published' then '{}'::text[]
    when 'players_updated' then array['added', 'removed']
    when 'teams_updated' then array['teamsAdded', 'teamsRemoved', 'playersMoved']
    when 'schedule_updated' then array['roundsAdded', 'roundsRemoved', 'roundsRescheduled', 'datesChanged']
  end;
  if v_keys is null then
    raise exception 'Unknown activity type.' using errcode = '22023';
  end if;
  select * into v_e from tournament_editions where id = p_edition;
  select * into v_t from tournaments where id = v_e.tournament_id;
  if v_t.is_legacy or v_e.is_test or v_e.published_at is null then return false; end if;

  if p_type = 'tournament_published' then
    if exists (select 1 from tournament_activity where edition_id = p_edition and activity_type = 'tournament_published') then return false; end if;
  else
    foreach v_key in array v_keys loop
      v_value := case when jsonb_typeof(p_metadata -> v_key) = 'number' then greatest(least(floor((p_metadata ->> v_key)::numeric), 10000), 0)::integer else 0 end;
      if v_value > 0 then v_meta := v_meta || jsonb_build_object(v_key, v_value); end if;
    end loop;
    if v_meta = '{}'::jsonb then return false; end if;
    select * into v_last from tournament_activity where edition_id = p_edition order by created_at desc, id desc limit 1;
    if v_last.id is not null and v_last.activity_type = p_type and v_last.created_at > now() - interval '15 minutes' then
      select jsonb_object_agg(k, coalesce((v_last.metadata ->> k)::integer, 0) + coalesce((v_meta ->> k)::integer, 0))
        into v_meta from unnest(v_keys) k where coalesce((v_last.metadata ->> k)::integer, 0) + coalesce((v_meta ->> k)::integer, 0) > 0;
      update tournament_activity set metadata = v_meta, created_at = now(), actor_profile_id = p_profile where id = v_last.id;
      return true;
    end if;
  end if;

  insert into tournament_activity (edition_id, tournament_id, activity_type, actor_profile_id, visibility, title, metadata)
  values (v_e.id, v_t.id, p_type, p_profile, 'everyone',
    case p_type when 'tournament_published' then 'Tournament published' when 'players_updated' then 'Players updated'
      when 'teams_updated' then 'Teams updated' else 'Schedule updated' end,
    v_meta);
  return true;
end;
$fn$;

revoke all on function public.get_tournament_activity(text, integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.post_commissioner_announcement(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_edition_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_tournament_activity(text, integer, uuid, integer) to service_role;
grant execute on function public.post_commissioner_announcement(uuid, uuid, text, text, text) to service_role;
grant execute on function public.record_edition_activity(uuid, uuid, text, jsonb) to service_role;

commit;
