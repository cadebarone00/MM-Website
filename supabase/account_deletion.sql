-- supabase/account_deletion.sql
-- Accounts V2, Step 3 (docs/account-deletion-design-2026-10-17.md; hard delete chosen in docs/auth-deletion-test-2026-10-17.md).
--
-- Permanent account deletion that never reaches other people's records:
--   * The profile row is never deleted. On deletion it becomes a TOMBSTONE: every personal field scrubbed, deleted_at
--     set, and no Auth account behind it (the login is hard-deleted by the server afterwards). Shared trip, round,
--     scorecard and tournament rows keep pointing at that anonymous id, so nothing cascades and nothing blocks.
--   * profiles.id is detached from auth.users (the ON DELETE CASCADE foreign key is replaced by an insert check), so the
--     hard delete of the login can't take the profile, or anything hanging off it, with it.
--   * Creator / host cascades become RESTRICT, and DELETE on profiles is refused outright.
--   * account_deletions is the minimal ledger (account id + state, no personal data). Being in it blocks the account
--     everywhere at once: a RESTRICTIVE row-level policy on every RLS table and on storage.objects, a PostgREST
--     pre-request check that also covers RPC calls, refusal of profile writes, and the server's getCurrentProfile.
--     Previously issued JWTs therefore stop working immediately, not when they expire.
--   * Trips the person organizes go to a member who ACCEPTED an organizer hand-off; otherwise completed trips are
--     archived and active ones restricted (no organizer). Nobody is made organizer without accepting.
--
-- The workflow is resumable: requested -> database_done -> storage_done -> auth_done -> completed. Each step can be
-- re-run safely. The server (lib/account/accountDeletion.ts) runs the Storage and Auth steps between the database ones.
--
-- Prerequisites: schema.sql, player_slots_full_name.sql, profile_identity.sql, profile_v1.sql,
-- profile_initialization.sql, platform_foundation.sql, golf_trips.sql, golf_trip_invitations.sql, shared_rounds.sql.
-- Optional tables (golf_trip_flights, golf_trip_personal_plans, trip_push_subscriptions, tournament_access_requests,
-- historical_*, player_rounds, scoring tables, storage.objects) are handled only if they exist.
-- Never rewrites or unlinks existing (V1) rows by itself: only an explicit deletion request for one account does.
-- Safe to run more than once. Undo: see the bottom of this file.

begin;

-- === Ledger and audit (no personal data) =============================================================================
create table if not exists public.account_deletions (
  account_id uuid primary key,
  state text not null default 'requested' check (state in ('requested', 'database_done', 'storage_done', 'auth_done', 'completed')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or length(last_error) <= 120)
);
comment on table public.account_deletions is
  'Accounts V2 deletion ledger: one row per deleted account id (random UUID, no personal data). Drives the resumable workflow and blocks the id everywhere; kept after completion only to stop a restored backup from bringing the account back (retention: decision D6).';

create table if not exists public.account_deletion_events (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  step text not null check (step in ('requested', 'database', 'storage', 'auth', 'completed', 'reapplied')),
  outcome text not null check (outcome in ('ok', 'failed', 'skipped')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists account_deletion_events_account_idx on public.account_deletion_events (account_id, created_at);
comment on table public.account_deletion_events is
  'Operational deletion log: step, outcome, row COUNTS and error codes only (no names, emails, IPs or free text). Purged after 90 days (purge_account_deletion_events).';

alter table public.account_deletions enable row level security;
alter table public.account_deletion_events enable row level security;
revoke all on public.account_deletions, public.account_deletion_events from public, anon, authenticated;

-- === Tombstone marker and organizer hand-offs ==========================================================================
alter table public.profiles add column if not exists deleted_at timestamptz;
comment on column public.profiles.deleted_at is 'Set when the account was deleted: this row is an anonymous tombstone kept only so shared records stay intact. Never a login.';

alter table public.golf_trips add column if not exists ownership_state text not null default 'owned';
alter table public.golf_trips drop constraint if exists golf_trips_ownership_state_check;
alter table public.golf_trips add constraint golf_trips_ownership_state_check check (ownership_state in ('owned', 'archived', 'restricted'));
alter table public.golf_trips add column if not exists ownership_changed_at timestamptz;
comment on column public.golf_trips.ownership_state is 'owned = has an organizer. archived = organizer deleted their account after the trip ended. restricted = organizer deleted their account mid-trip and nobody had accepted the hand-off: members keep their data, organizer actions are unavailable.';

create table if not exists public.golf_trip_organizer_handoffs (
  golf_trip_id uuid primary key references public.golf_trips(id) on delete cascade,
  from_profile uuid not null references public.profiles(id),
  to_profile uuid not null references public.profiles(id),
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (from_profile <> to_profile)
);
alter table public.golf_trip_organizer_handoffs add column if not exists declined_at timestamptz;
alter table public.golf_trip_organizer_handoffs enable row level security;
revoke all on public.golf_trip_organizer_handoffs from public, anon, authenticated;

-- === Old player records released by a deletion stay LOCKED ==============================================================
-- A deleted person's legacy claim is unlinked, but the slot must never look "free" to the next person. Nothing may claim
-- a locked slot (no invitation, no initialization, no admin tool) until a future, separately authorized reassignment
-- with independently verified ownership (not built) sets maroon.claim_unlock for its own transaction.
alter table public.player_slots add column if not exists claim_locked_at timestamptz;
alter table public.player_slots add column if not exists claim_locked_reason text;
alter table public.player_slots drop constraint if exists player_slots_claim_locked_reason_check;
alter table public.player_slots add constraint player_slots_claim_locked_reason_check
  check (claim_locked_reason is null or claim_locked_reason in ('account_deleted'));

create or replace function public.guard_locked_player_slot()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('maroon.claim_unlock', true), '') = 'on' then return new; end if;
  if tg_table_name = 'player_slots' then
    if old.claim_locked_at is not null and (new.claimed_by is not null or new.claim_locked_at is null) then
      raise exception 'This player record is locked after an account deletion.' using errcode = '42501';
    end if;
  elsif exists (select 1 from player_slots where player_slug = new.player_slug and claim_locked_at is not null) then
    raise exception 'This player record is locked after an account deletion.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_locked_player_slot on public.player_slots;
create trigger guard_locked_player_slot before update on public.player_slots
  for each row execute function public.guard_locked_player_slot();
do $$
begin
  if to_regclass('public.player_claim_invitations') is not null then
    execute 'drop trigger if exists guard_locked_player_slot on public.player_claim_invitations';
    execute 'create trigger guard_locked_player_slot before insert or update on public.player_claim_invitations
      for each row execute function public.guard_locked_player_slot()';
  end if;
end $$;

-- === Detach the profile from the login, guard it, defuse creator / host cascades ======================================
do $$
declare
  c record;
begin
  for c in select con.conname from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass and con.contype = 'f' and con.confrelid = 'auth.users'::regclass loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  for c in select con.conname, rel.relname, att.attname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass and con.confdeltype = 'c'
      and ((rel.relname = 'golf_trips' and att.attname = 'created_by') or (rel.relname = 'shared_rounds' and att.attname = 'host')) loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete restrict', c.relname, c.conname, c.attname);
  end loop;
end $$;

-- A profile is still only ever created for an existing login (what the foreign key used to guarantee), never for a
-- deleted one. Tombstones can't be edited except by the deletion function, and profiles are never deleted.
create or replace function public.guard_profile_rows()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('maroon.allow_profile_delete', true), '') <> 'on' then
      raise exception 'Profiles are never deleted; account deletion turns them into tombstones.' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from auth.users where id = new.id) then
      raise exception 'No account found.' using errcode = '42501';
    end if;
    if exists (select 1 from account_deletions where account_id = new.id) then
      raise exception 'This account has been deleted.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.deleted_at is not null or exists (select 1 from account_deletions where account_id = old.id))
     and coalesce(current_setting('maroon.account_deletion', true), '') <> 'on' then
    raise exception 'This account has been deleted.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_rows on public.profiles;
create trigger guard_profile_rows before insert or update or delete on public.profiles
  for each row execute function public.guard_profile_rows();

-- === Blocking a deleted account everywhere, including old JWTs ========================================================
create or replace function public.account_is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or not exists (select 1 from account_deletions where account_id = auth.uid());
$$;

-- PostgREST pre-request hook: every REST / RPC request with a deleted account's token is refused before it runs.
create or replace function public.reject_deleted_accounts()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not account_is_active() then
    raise exception 'This account has been deleted.' using errcode = '42501';
  end if;
end;
$$;

-- RESTRICTIVE policy on every RLS table (public + storage.objects): ANDed with the existing policies, so it never grants
-- anything, it only removes access for a deleted account. Re-run apply_active_account_policies() after adding tables.
create or replace function public.apply_active_account_policies()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  t record;
  n integer := 0;
begin
  for t in select n2.nspname, c.relname from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
    where c.relkind in ('r', 'p') and c.relrowsecurity
      and (n2.nspname = 'public' or (n2.nspname = 'storage' and c.relname = 'objects')) loop
    execute format('drop policy if exists active_account_only on %I.%I', t.nspname, t.relname);
    execute format('create policy active_account_only on %I.%I as restrictive for all to authenticated
      using ((select public.account_is_active())) with check ((select public.account_is_active()))', t.nspname, t.relname);
    n := n + 1;
  end loop;
  return n;
end;
$$;
select public.apply_active_account_policies();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.reject_deleted_accounts''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;

-- === Requests, hand-offs and the database step =========================================================================
create or replace function public.request_account_deletion(p_account uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_state text;
begin
  select state into v_state from account_deletions where account_id = p_account;
  if v_state is null then
    if not exists (select 1 from auth.users where id = p_account) then
      raise exception 'No account found.' using errcode = '42501';
    end if;
    insert into account_deletions (account_id) values (p_account) on conflict (account_id) do nothing;
    insert into account_deletion_events (account_id, step, outcome) values (p_account, 'requested', 'ok');
    v_state := 'requested';
  end if;
  -- Closed at once: the ledger row already blocks RLS, Storage and REST; mark the profile so the app sees it too.
  perform set_config('maroon.account_deletion', 'on', true);
  update profiles set deleted_at = coalesce(deleted_at, now()) where id = p_account;
  perform set_config('maroon.account_deletion', 'off', true);
  return jsonb_build_object('state', v_state);
end;
$$;

-- Organizer offers the trip to an accepted member with a finished profile; only that member can accept.
create or replace function public.offer_golf_trip_organizer(p_profile uuid, p_trip uuid, p_to_profile uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then
    raise exception 'Only the organizer can hand off this trip.' using errcode = '42501';
  end if;
  if p_to_profile = p_profile or not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_to_profile and invitation_status = 'accepted')
     or not profile_is_complete(p_to_profile) or exists (select 1 from account_deletions where account_id = p_to_profile) then
    raise exception 'Pick a member who has joined the trip and finished their profile.' using errcode = '22023';
  end if;
  insert into golf_trip_organizer_handoffs (golf_trip_id, from_profile, to_profile) values (p_trip, p_profile, p_to_profile)
  on conflict (golf_trip_id) do update set from_profile = excluded.from_profile, to_profile = excluded.to_profile, offered_at = now(),
    accepted_at = null, declined_at = null;
  return jsonb_build_object('offered', true);
end;
$$;

create or replace function public.accept_golf_trip_organizer(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not profile_is_complete(p_profile) or exists (select 1 from account_deletions where account_id = p_profile) then
    raise exception 'Finish setting up your profile first.' using errcode = '42501';
  end if;
  update golf_trip_organizer_handoffs set accepted_at = coalesce(accepted_at, now()), declined_at = null
  where golf_trip_id = p_trip and to_profile = p_profile;
  if not found then raise exception 'There is no organizer hand-off for you on this trip.' using errcode = '42501'; end if;
  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.decline_golf_trip_organizer(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update golf_trip_organizer_handoffs set declined_at = coalesce(declined_at, now()), accepted_at = null
  where golf_trip_id = p_trip and to_profile = p_profile;
  if not found then raise exception 'There is no organizer hand-off for you on this trip.' using errcode = '42501'; end if;
  return jsonb_build_object('declined', true);
end;
$$;

create or replace function public.cancel_golf_trip_organizer(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_trip_organizer_handoffs where golf_trip_id = p_trip and from_profile = p_profile;
  return jsonb_build_object('cancelled', found);
end;
$$;

-- Offers waiting for this person to accept or decline (Settings shows them).
create or replace function public.list_my_organizer_offers(p_profile uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('tripId', t.id, 'tripName', t.name, 'startDate', t.start_date, 'endDate', t.end_date,
    'fromName', coalesce(p.display_name, 'The organizer'), 'accepted', h.accepted_at is not null, 'declined', h.declined_at is not null)
    order by h.offered_at), '[]'::jsonb)
  from golf_trip_organizer_handoffs h join golf_trips t on t.id = h.golf_trip_id join profiles p on p.id = h.from_profile
  where h.to_profile = p_profile and p.deleted_at is null;
$$;

-- What deletion would do for this person, with the same rules execute_account_deletion uses. Read-only.
create or replace function public.account_deletion_preview(p_profile uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_trips jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'startDate'), '[]'::jsonb) into v_trips from (
    select jsonb_build_object('tripId', t.id, 'name', t.name, 'startDate', t.start_date, 'endDate', t.end_date,
      'ended', (t.status = 'completed' or t.end_date < current_date),
      'handoff', case when h.golf_trip_id is null then null else jsonb_build_object('toProfileId', h.to_profile,
        'toName', coalesce(tp.display_name, 'A member'), 'state', case when h.accepted_at is not null then 'accepted'
        when h.declined_at is not null then 'declined' else 'pending' end) end,
      'outcome', case
        when h.accepted_at is not null and profile_is_complete(h.to_profile) and not exists (select 1 from account_deletions d where d.account_id = h.to_profile) then 'transfer'
        when t.status = 'completed' or t.end_date < current_date then 'archive' else 'restrict' end,
      'eligible', coalesce((select jsonb_agg(jsonb_build_object('memberId', m2.id, 'name', p2.display_name) order by p2.display_name)
        from golf_trip_members m2 join profiles p2 on p2.id = m2.profile_id
        where m2.golf_trip_id = t.id and m2.invitation_status = 'accepted' and m2.profile_id <> p_profile
          and profile_is_complete(m2.profile_id) and not exists (select 1 from account_deletions d where d.account_id = m2.profile_id)), '[]'::jsonb)) x
    from golf_trips t join golf_trip_members m on m.golf_trip_id = t.id and m.profile_id = p_profile and m.role = 'organizer'
    left join golf_trip_organizer_handoffs h on h.golf_trip_id = t.id and h.from_profile = p_profile
    left join profiles tp on tp.id = h.to_profile
  ) s(x);
  v_counts := jsonb_build_object(
    'tripsJoined', (select count(*) from golf_trip_members where profile_id = p_profile and role <> 'organizer'),
    'sharedRoundsHosted', (select count(*) from shared_rounds where host = p_profile and status = 'live'),
    'tournamentRoles', (select count(*) from tournament_members where profile_id = p_profile),
    'legacyPlayer', exists (select 1 from player_slots where claimed_by = p_profile),
    'personalRounds', account_deletion_exec_count('public.player_rounds', 'select 1 from public.player_rounds where profile_id = $1 and source = ''personal''', p_profile),
    'sharedRounds', account_deletion_exec_count('public.player_rounds', 'select 1 from public.player_rounds where profile_id = $1 and source <> ''personal''', p_profile),
    'scorecards', account_deletion_exec_count('public.scorecard_submissions', 'select 1 from public.scorecard_submissions where golfer_profile_id = $1', p_profile),
    'openBets', account_deletion_exec_count('public.mm_coin_bets', 'select 1 from public.mm_coin_bets where profile_id = $1 and status = ''pending''', p_profile),
    'files', (select count(*) from list_account_storage_objects(p_profile)));
  return jsonb_build_object('trips', v_trips, 'counts', v_counts);
end;
$$;

-- Deletes `sql` rows only if the table exists; returns the row count.
create or replace function public.account_deletion_exec_count(p_table text, p_sql text, p_account uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
begin
  if to_regclass(p_table) is null then return 0; end if;
  execute p_sql using p_account;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.execute_account_deletion(p_account uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ledger public.account_deletions;
  v_trip record;
  v_successor uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_col text;
begin
  select * into v_ledger from account_deletions where account_id = p_account for update;
  if v_ledger.account_id is null then raise exception 'No deletion was requested for this account.' using errcode = '42501'; end if;
  if v_ledger.state <> 'requested' then return jsonb_build_object('state', v_ledger.state, 'changed', false); end if;
  perform set_config('maroon.account_deletion', 'on', true);

  -- 1. Trips this person organizes: accepted hand-off -> new organizer; else archive (ended) or restrict (active).
  for v_trip in select t.id, t.status, t.end_date from golf_trips t join golf_trip_members m on m.golf_trip_id = t.id
      where m.profile_id = p_account and m.role = 'organizer' for update of t loop
    select h.to_profile into v_successor from golf_trip_organizer_handoffs h
      where h.golf_trip_id = v_trip.id and h.from_profile = p_account and h.accepted_at is not null
        and profile_is_complete(h.to_profile) and not exists (select 1 from account_deletions d where d.account_id = h.to_profile)
        and exists (select 1 from golf_trip_members m where m.golf_trip_id = v_trip.id and m.profile_id = h.to_profile and m.invitation_status = 'accepted');
    update golf_trip_members set role = 'member' where golf_trip_id = v_trip.id and profile_id = p_account;
    if v_successor is not null then
      update golf_trip_members set role = 'organizer' where golf_trip_id = v_trip.id and profile_id = v_successor;
      update golf_trips set ownership_state = 'owned', ownership_changed_at = now() where id = v_trip.id;
      v_counts := jsonb_set(v_counts, '{tripsTransferred}', to_jsonb(coalesce((v_counts->>'tripsTransferred')::int, 0) + 1));
    elsif v_trip.status = 'completed' or v_trip.end_date < current_date then
      update golf_trips set ownership_state = 'archived', ownership_changed_at = now() where id = v_trip.id;
      v_counts := jsonb_set(v_counts, '{tripsArchived}', to_jsonb(coalesce((v_counts->>'tripsArchived')::int, 0) + 1));
    else
      update golf_trips set ownership_state = 'restricted', ownership_changed_at = now() where id = v_trip.id;
      v_counts := jsonb_set(v_counts, '{tripsRestricted}', to_jsonb(coalesce((v_counts->>'tripsRestricted')::int, 0) + 1));
    end if;
    v_successor := null;
  end loop;
  delete from golf_trip_organizer_handoffs where from_profile = p_account or to_profile = p_account;

  -- 2. Shared rounds they host end (scores stay); their tournament roles end (the tournament stays).
  update shared_rounds set status = 'ended' where host = p_account and status = 'live';
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('sharedRoundsEnded', v_n);
  delete from tournament_members where profile_id = p_account;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('tournamentRolesRemoved', v_n);

  -- 3. Personal data nobody else needs.
  v_counts := v_counts || jsonb_build_object(
    'flights', account_deletion_exec_count('public.golf_trip_flights',
      'delete from public.golf_trip_flights where member_id in (select id from public.golf_trip_members where profile_id = $1)', p_account),
    'personalPlans', account_deletion_exec_count('public.golf_trip_personal_plans', 'delete from public.golf_trip_personal_plans where profile_id = $1', p_account),
    'pushSubscriptions', account_deletion_exec_count('public.trip_push_subscriptions', 'delete from public.trip_push_subscriptions where profile_id = $1', p_account),
    'accessRequests', account_deletion_exec_count('public.tournament_access_requests', 'delete from public.tournament_access_requests where profile_id = $1', p_account),
    'creatorAccess', account_deletion_exec_count('public.tournament_creator_access', 'delete from public.tournament_creator_access where profile_id = $1', p_account),
    'claimInvitations', account_deletion_exec_count('public.player_claim_invitations', 'delete from public.player_claim_invitations where account_id = $1', p_account),
    'linkRequests', account_deletion_exec_count('public.historical_link_requests', 'delete from public.historical_link_requests where profile_id = $1', p_account),
    'personalRounds', account_deletion_exec_count('public.player_rounds', 'delete from public.player_rounds where profile_id = $1 and source = ''personal''', p_account),
    'openBetsCancelled', account_deletion_exec_count('public.mm_coin_bets', 'delete from public.mm_coin_bets where profile_id = $1 and status = ''pending''', p_account),
    'coinBalance', account_deletion_exec_count('public.wagers_accounts', 'delete from public.wagers_accounts where profile_id = $1', p_account));

  -- 4. Shared records stay, de-identified: names / emails others typed about them, and legacy links.
  update golf_trip_members set display_name = 'Former member', email = null, phone = null where profile_id = p_account;
  update tournament_players set display_name = 'Former player', email = null where profile_id = p_account;
  -- Unlinked AND locked: never available for the next person to take (see guard_locked_player_slot).
  update player_slots set claimed_by = null, claimed_at = null, claim_locked_at = now(), claim_locked_reason = 'account_deleted'
  where claimed_by = p_account;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('legacyClaimsReleased', v_n);
  v_counts := v_counts || jsonb_build_object('historyLinksRemoved', account_deletion_exec_count('public.historical_participants',
    'update public.historical_participants set profile_id = null where profile_id = $1', p_account));

  -- 5. The tombstone: every personal field gone; only the random id stays as an anchor for shared rows.
  update profiles set email = '', username = null, display_name = null, player_slug = null, is_host = false,
    deleted_at = coalesce(deleted_at, now()) where id = p_account;
  foreach v_col in array array['bio', 'avatar_path', 'platform_role'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = v_col) then
      execute format('update public.profiles set %I = null where id = $1', v_col) using p_account;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'rounds_visibility') then
    execute 'update public.profiles set rounds_visibility = ''private'' where id = $1' using p_account;
  end if;

  update account_deletions set state = 'database_done', updated_at = now(), last_error = null where account_id = p_account;
  insert into account_deletion_events (account_id, step, outcome, detail) values (p_account, 'database', 'ok', v_counts);
  perform set_config('maroon.account_deletion', 'off', true);
  return jsonb_build_object('state', 'database_done', 'changed', true, 'counts', v_counts);
end;
$$;

-- Files the server must remove through the Storage API (owned by the account, or under its profile-photos folder).
create or replace function public.list_account_storage_objects(p_account uuid)
returns table (bucket_id text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  return query execute 'select o.bucket_id::text, o.name::text from storage.objects o
    where o.owner_id = $1::text or o.owner = $1 or (o.bucket_id = ''profile-photos'' and o.name like $1::text || ''/%'')'
  using p_account;
end;
$$;

-- Server records the outcome of the Storage / Auth steps. Steps only move forward, one at a time; repeats are no-ops.
create or replace function public.record_account_deletion_step(p_account uuid, p_step text, p_ok boolean, p_error text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_state text;
  v_from text := case p_step when 'storage' then 'database_done' when 'auth' then 'storage_done' when 'completed' then 'auth_done' end;
  v_to text := case p_step when 'storage' then 'storage_done' when 'auth' then 'auth_done' when 'completed' then 'completed' end;
begin
  if v_from is null then raise exception 'Unknown step.' using errcode = '22023'; end if;
  select state into v_state from account_deletions where account_id = p_account for update;
  if v_state is null then raise exception 'No deletion was requested for this account.' using errcode = '42501'; end if;
  if v_state <> v_from then return jsonb_build_object('state', v_state, 'changed', false); end if;
  if p_ok then
    update account_deletions set state = v_to, updated_at = now(), last_error = null,
      completed_at = case when v_to = 'completed' then now() end where account_id = p_account;
  else
    update account_deletions set attempts = attempts + 1, updated_at = now(), last_error = left(coalesce(p_error, 'failed'), 120)
    where account_id = p_account;
  end if;
  insert into account_deletion_events (account_id, step, outcome, detail)
  values (p_account, p_step, case when p_ok then 'ok' else 'failed' end,
    case when p_error is null then '{}'::jsonb else jsonb_build_object('error', left(p_error, 120)) end);
  return jsonb_build_object('state', case when p_ok then v_to else v_state end, 'changed', p_ok);
end;
$$;

-- Files that still belong to a FINISHED deletion (e.g. uploaded with an old token in the moment before the account
-- closed, or a Storage hiccup after the step was recorded). The retry job removes them.
create or replace function public.orphaned_deleted_account_objects(p_limit integer default 200)
returns table (account_id uuid, bucket_id text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  return query execute 'select d.account_id, o.bucket_id::text, o.name::text from public.account_deletions d
    join storage.objects o on (o.owner_id = d.account_id::text or o.owner = d.account_id
      or (o.bucket_id = ''profile-photos'' and o.name like d.account_id::text || ''/%''))
    where d.state in (''storage_done'', ''auth_done'', ''completed'') limit $1'
  using greatest(p_limit, 1);
end;
$$;

create or replace function public.account_deletion_state(p_account uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('state', state, 'attempts', attempts, 'lastError', last_error)
    from account_deletions where account_id = p_account), jsonb_build_object('state', null));
$$;

-- Unfinished deletions for the server's retry sweeper (oldest first).
create or replace function public.pending_account_deletions(p_limit integer default 50)
returns table (account_id uuid, state text, attempts integer)
language sql stable security definer set search_path = public as $$
  select account_id, state, attempts from account_deletions where state <> 'completed' order by updated_at limit greatest(p_limit, 1);
$$;

-- After restoring a backup: anything the ledger says was deleted but came back is queued again (state -> requested).
create or replace function public.reapply_account_deletions()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with requeued as (
    update account_deletions d set state = 'requested', completed_at = null, updated_at = now()
    where d.state <> 'requested' and (
      exists (select 1 from auth.users u where u.id = d.account_id)
      or exists (select 1 from profiles p where p.id = d.account_id and (p.deleted_at is null or p.email <> '' or p.username is not null)))
    returning d.account_id
  ), logged as (
    insert into account_deletion_events (account_id, step, outcome) select account_id, 'reapplied', 'ok' from requeued returning 1
  )
  select count(*) into n from logged;
  return n;
end;
$$;

-- 90-day operational log retention (decision D6, proposal).
create or replace function public.purge_account_deletion_events(p_keep interval default interval '90 days')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  delete from account_deletion_events where created_at < now() - p_keep;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- === Grants ==============================================================================================================
revoke all on function public.guard_profile_rows() from public, anon, authenticated;
revoke all on function public.apply_active_account_policies() from public, anon, authenticated;
revoke all on function public.request_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.offer_golf_trip_organizer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_golf_trip_organizer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.account_deletion_exec_count(text, text, uuid) from public, anon, authenticated;
revoke all on function public.execute_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.list_account_storage_objects(uuid) from public, anon, authenticated;
revoke all on function public.record_account_deletion_step(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.account_deletion_state(uuid) from public, anon, authenticated;
revoke all on function public.pending_account_deletions(integer) from public, anon, authenticated;
revoke all on function public.reapply_account_deletions() from public, anon, authenticated;
revoke all on function public.purge_account_deletion_events(interval) from public, anon, authenticated;
revoke all on function public.guard_locked_player_slot() from public, anon, authenticated;
revoke all on function public.decline_golf_trip_organizer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_golf_trip_organizer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_my_organizer_offers(uuid) from public, anon, authenticated;
revoke all on function public.account_deletion_preview(uuid) from public, anon, authenticated;
revoke all on function public.orphaned_deleted_account_objects(integer) from public, anon, authenticated;
grant execute on function public.decline_golf_trip_organizer(uuid, uuid), public.cancel_golf_trip_organizer(uuid, uuid),
  public.list_my_organizer_offers(uuid), public.account_deletion_preview(uuid), public.orphaned_deleted_account_objects(integer) to service_role;
grant execute on function public.request_account_deletion(uuid), public.offer_golf_trip_organizer(uuid, uuid, uuid),
  public.accept_golf_trip_organizer(uuid, uuid), public.execute_account_deletion(uuid), public.list_account_storage_objects(uuid),
  public.record_account_deletion_step(uuid, text, boolean, text), public.account_deletion_state(uuid),
  public.pending_account_deletions(integer), public.reapply_account_deletions(), public.purge_account_deletion_events(interval),
  public.apply_active_account_policies() to service_role;
-- The checks below run inside every browser request (policies / pre-request), so the request roles must call them.
-- They only answer "is the CURRENT token's account active?"; they take no arguments.
revoke all on function public.account_is_active() from public;
revoke all on function public.reject_deleted_accounts() from public;
grant execute on function public.account_is_active(), public.reject_deleted_accounts() to anon, authenticated, service_role;

commit;

-- Undo (development only; never after a real deletion has run, or tombstones lose their protection):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
--   drop the active_account_only policies; drop trigger guard_profile_rows; drop the functions and the three tables;
--   golf_trips.created_by / shared_rounds.host back to on delete cascade; re-add
--   profiles.id references auth.users(id) on delete cascade (fails if any tombstone exists, by design).
