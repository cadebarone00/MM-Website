-- docs/admin-regrant-DRAFT.sql
-- DRAFT FOR APPROVAL. NOT APPROVED. DRY RUN ONLY: the last line is ROLLBACK. Not to be run on production.
--
-- After the V2 reset there are no admins in the app. This gives the owner's NEW V2 profile the same powers the legacy
-- admin accounts had, in one step:
--   * profiles.is_host = true            Maroon Admin Center (lib/portal/requireHost.ts)
--   * profiles.platform_role = 'admin'   platform admin: tournament access approvals, Highlights admin, birthday review
--   * tournament_creator_access approved may create tournaments
--   * owner of The Maroon Tournament     the same row platform_foundation.sql gives every host
--
-- Who it picks: exactly ONE login with the email typed below, whose email is confirmed and whose profile exists (and,
-- when V2 activation is installed, is Active). Anything else (0 matches, 2+ matches, unconfirmed, not finished) stops it.
-- The email is only used to find the row; it is never printed. Output is counts only.
--
-- More admins later: run it once per person (each new V2 account), after that person finishes onboarding.
--
-- Permanent control does NOT depend on this script: the Supabase project owner can always run it again from the
-- dashboard SQL editor (plan section 3, "break-glass").

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 2026-10-30: grant 'owner' (all four powers, for the owner) or 'organizer' (The Maroon organizer membership ONLY: no
-- Admin Center, no platform admin, no creator access). Each person is authorized explicitly, after their fresh V2 sign-up.
create temp table regrant_input (email text, grant_kind text check (grant_kind in ('owner', 'organizer'))) on commit drop;
insert into regrant_input values (null, null);   -- e.g. ('name@example.com', 'owner') or ('cam@example.com', 'organizer')

do $$
declare v_email text; v_kind text; v_id uuid; v_count int; v_maroon uuid;
begin
  select lower(trim(email)), grant_kind into v_email, v_kind from regrant_input;
  if v_email is null or v_email = '' or v_kind is null then raise exception 'Type the email and owner / organizer first. Nothing was changed.'; end if;

  select count(*) into v_count from auth.users where lower(email) = v_email;
  if v_count <> 1 then raise exception 'Expected exactly 1 login with that email, found %. Nothing was changed.', v_count; end if;
  select id into v_id from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_id is null then raise exception 'That login has not confirmed its email yet. Nothing was changed.'; end if;
  if not exists (select 1 from public.profiles where id = v_id) then
    raise exception 'That login has no profile yet: finish V2 sign-up first. Nothing was changed.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'activated_at') then
    execute 'select count(*) from public.profiles where id = $1 and activated_at is not null' into v_count using v_id;
    if v_count = 0 then raise exception 'That profile has not finished V2 onboarding (not Active). Nothing was changed.'; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at') then
    execute 'select count(*) from public.profiles where id = $1 and deleted_at is not null' into v_count using v_id;
    if v_count > 0 then raise exception 'That profile is a deleted-account tombstone. Nothing was changed.'; end if;
  end if;

  if v_kind = 'organizer' then
    if to_regclass('public.tournament_members') is null then raise exception 'tournament_members is not installed. Nothing was changed.'; end if;
    select id into v_maroon from public.tournaments where slug = 'the-maroon-tournament';
    if v_maroon is null then raise exception 'The Maroon tournament was not found. Nothing was changed.'; end if;
    -- Never downgrades an owner.
    insert into public.tournament_members (tournament_id, profile_id, role) values (v_maroon, v_id, 'organizer')
    on conflict (tournament_id, profile_id) do update set role = 'organizer' where public.tournament_members.role not in ('owner', 'organizer');
    return;
  end if;

  update public.profiles set is_host = true where id = v_id;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'platform_role') then
    execute 'update public.profiles set platform_role = ''admin'' where id = $1' using v_id;
  end if;
  if to_regclass('public.tournament_creator_access') is not null then
    insert into public.tournament_creator_access (profile_id, status, decided_by, decided_at) values (v_id, 'approved', v_id, now())
    on conflict (profile_id) do update set status = 'approved', decided_by = excluded.decided_by, decided_at = excluded.decided_at;
  end if;
  if to_regclass('public.tournament_members') is not null then
    select id into v_maroon from public.tournaments where slug = 'the-maroon-tournament';
    if v_maroon is not null then
      insert into public.tournament_members (tournament_id, profile_id, role) values (v_maroon, v_id, 'owner')
      on conflict (tournament_id, profile_id) do update set role = 'owner';
    end if;
  end if;
end $$;

-- Result (counts only): how many admins of each kind exist now. After the first run, expect 1 in each column.
select (select count(*) from public.profiles where is_host) as maroon_admins,
  (select count(*) from public.profiles p where to_jsonb(p) ->> 'platform_role' = 'admin') as platform_admins,
  (select count(*) from public.tournament_creator_access where status = 'approved') as tournament_creators,
  (select count(*) from public.tournament_members m join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'the-maroon-tournament' and m.role = 'owner') as maroon_owners,
  (select count(*) from public.tournament_members m join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'the-maroon-tournament' and m.role = 'organizer') as maroon_organizers;

-- DRY RUN: undo everything above. Only the approved run may replace this one word with COMMIT.
rollback;
