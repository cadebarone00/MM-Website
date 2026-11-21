-- supabase/maroon_live_visibility.sql
-- The Maroon Live, Step 1 (project_specs.md, "Feature: The Maroon Live"): who can watch an event's live site.
--   public  = anyone can find it and watch (no sign-in)
--   link    = not listed; anyone with the share link (the watch code) can watch
--   private = no live site, and the share link stops working
-- Plus live_players_can_share: whether players (not only organizers) get the share link.
--
-- Existing events: public tournaments -> public, other tournaments -> private, existing trips -> link (their watch
-- links keep working, owner-approved 2026-11-21). New events start private. Leagues get the columns now; their live
-- site comes in Step 3.
--
-- Prerequisites: golf_trips.sql, tournament_codes.sql, watch_codes.sql, tournament_public.sql (leagues.sql optional).
-- Safe to run more than once.
-- Undo: alter table public.golf_trips drop column live_visibility, drop column live_players_can_share;
--       alter table public.code_tournaments drop column live_visibility, drop column live_players_can_share;
--       alter table public.leagues drop column live_visibility, drop column live_players_can_share;
--       drop function public.set_live_visibility(uuid, text, uuid, text, boolean);
--       then re-run watch_codes.sql (find_watch_code) and tournament_public.sql (set_code_tournament_public).

begin;

-- 1. Columns. Added with the backfill default first, then the default for new rows is switched to private.
alter table public.golf_trips add column if not exists live_visibility text not null default 'link';
alter table public.golf_trips add column if not exists live_players_can_share boolean not null default true;
alter table public.golf_trips alter column live_visibility set default 'private';

alter table public.code_tournaments add column if not exists live_visibility text;
update public.code_tournaments set live_visibility = case when is_public then 'public' else 'private' end where live_visibility is null;
alter table public.code_tournaments alter column live_visibility set default 'private';
alter table public.code_tournaments alter column live_visibility set not null;
alter table public.code_tournaments add column if not exists live_players_can_share boolean not null default true;

do $$
begin
  if to_regclass('public.leagues') is not null then
    execute 'alter table public.leagues add column if not exists live_visibility text not null default ''private''';
    execute 'alter table public.leagues add column if not exists live_players_can_share boolean not null default true';
    if not exists (select 1 from pg_constraint where conname = 'leagues_live_visibility_check') then
      execute 'alter table public.leagues add constraint leagues_live_visibility_check check (live_visibility in (''public'', ''link'', ''private''))';
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_trips_live_visibility_check') then
    alter table public.golf_trips add constraint golf_trips_live_visibility_check check (live_visibility in ('public', 'link', 'private'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'code_tournaments_live_visibility_check') then
    alter table public.code_tournaments add constraint code_tournaments_live_visibility_check check (live_visibility in ('public', 'link', 'private'));
  end if;
end $$;

-- 2. The organizer changes it. p_kind: 'trip' or 'tournament'. Tournaments keep is_public in step (the Tourneys
--    search and /tournaments/live/<id> read it). Returns true when saved; errors 42501 (not the organizer) or
--    22023 (bad value).
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
  else
    raise exception 'Unknown event kind.' using errcode = '22023';
  end if;
  return found;
end $$;

-- 3. The old Public / Private switch keeps working and keeps live_visibility in step.
create or replace function public.set_code_tournament_public(p_organizer uuid, p_tournament uuid, p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can change this.' using errcode = '42501'; end if;
  update code_tournaments set is_public = coalesce(p_public, false),
    live_visibility = case when coalesce(p_public, false) then 'public' else 'private' end where id = p_tournament;
end $$;

-- 4. A share link (watch code) only opens events that aren't Private. Same reply as watch_codes.sql otherwise.
create or replace function public.find_watch_code(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('kind', 'tournament', 'id', t.id, 'organizer', t.organizer)
       from code_tournaments t where t.watch_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
        and t.live_visibility <> 'private'),
    (select jsonb_build_object('kind', 'trip', 'id', g.id, 'organizer',
       (select m.profile_id from golf_trip_members m where m.golf_trip_id = g.id and m.role = 'organizer' and m.profile_id is not null limit 1))
       from golf_trips g where g.watch_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
        and g.live_visibility <> 'private'));
$$;

revoke all on function public.set_live_visibility(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_live_visibility(uuid, text, uuid, text, boolean) to service_role;
revoke all on function public.set_code_tournament_public(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_code_tournament_public(uuid, uuid, boolean) to service_role;
revoke all on function public.find_watch_code(text) from public, anon, authenticated;
grant execute on function public.find_watch_code(text) to service_role;

commit;
