-- supabase/account_activation.sql
-- Pending accounts, onboarding activation & 13+ eligibility — PHASE 1 FOUNDATION (project_specs.md, section
-- "Pending accounts, onboarding activation & 13+ eligibility", approved 2026-10-28).
--
-- INERT BY DESIGN. Running this file changes nothing anyone can see or do:
--   * It adds one nullable column (profiles.activated_at, NULL everywhere) and new private tables (empty).
--   * activate_my_profile() refuses to run while account_activation_settings.activation_enabled is false (the default),
--     and no legal document version is configured, so nothing can be activated by accident.
--   * NOTHING here changes who can read or write existing data: no existing function, trigger or policy is replaced.
--     The access rules (Active-only golf features, Active-only discovery, legacy backfill) are PROPOSED separately in
--     supabase/account_activation_enforcement.sql, which is not run in Phase 1.
--   * No existing profile is activated or reclassified. legacy_activation_classify() only READS (dry-run inventory).
--
-- Identity is unchanged: one Supabase account = one permanent profile (profiles.id = auth.users.id), created only by
-- initialize_my_profile(). Every function takes the account id from the server's verified session (service_role only;
-- browsers have no access), never from a request body.
--
-- Private data (birthdate, eligibility, Terms, held invitations, correction audit) lives in server-only tables:
-- RLS on and ALL privileges revoked from public / anon / authenticated. The birthdate is never returned by any function.
--
-- Prerequisites: schema.sql, profile_identity.sql, platform_foundation.sql, golf_trips.sql, golf_trip_invitations.sql,
-- player_rounds.sql (rounds_visibility), profile_v1.sql, profile_initialization.sql, account_deletion.sql.
-- Optional tables (player_rounds, shared_round_players, scoring_group_players, code_tournament_players,
-- profile_friend_requests, player_claim_invitations) are checked only if they exist.
-- Safe to run more than once. Undo: see the bottom of this file.

-- === Switches (both OFF / empty until a later, approved phase) ===========================================================
create table if not exists public.account_activation_settings (
  id boolean primary key default true check (id),
  activation_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.account_activation_settings (id) values (true) on conflict (id) do nothing;
comment on table public.account_activation_settings is 'One row. activation_enabled stays false until the activation feature is approved to go live; activate_my_profile() refuses while it is false.';

-- The CURRENT version of each legal document people must accept. Empty until final legal text exists (launch blocker).
create table if not exists public.legal_document_versions (
  document text primary key check (document in ('terms', 'privacy')),
  current_version text not null check (length(trim(current_version)) between 1 and 40),
  effective_at timestamptz not null default now()
);

-- === Profile activation marker ===========================================================================================
alter table public.profiles add column if not exists activated_at timestamptz;
comment on column public.profiles.activated_at is 'Set once, only by activate_my_profile() (Finish), when every requirement was checked on the server. NULL = Pending. Never cleared.';

-- Nobody (browser, admin tool, other function) can set or change activated_at except activate_my_profile() (and the
-- separately approved legacy backfill), which turn the transaction-local flag maroon.activation on.
create or replace function public.guard_profile_activation()
returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('maroon.activation', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.activated_at is not null then
    raise exception 'Only Finish can activate a profile.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.activated_at is distinct from old.activated_at then
    raise exception 'Only Finish can activate a profile.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_activation on public.profiles;
create trigger guard_profile_activation before insert or update of activated_at on public.profiles
  for each row execute function public.guard_profile_activation();

-- === Private tables (server only) ========================================================================================
create table if not exists public.account_birthdates (
  account_id uuid primary key references auth.users(id) on delete cascade,
  birthdate date not null check (birthdate >= date '1900-01-01'),
  source text not null check (source in ('self', 'admin_correction')),
  recorded_at timestamptz not null default now(),
  corrected_at timestamptz
);
comment on table public.account_birthdates is 'PRIVATE. Date of birth, written once by the person (set_my_birthdate) and only changed through an approved support correction. Never returned to any client.';

create table if not exists public.account_eligibility (
  account_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('ineligible', 'review')),
  reason text not null check (reason in ('under_13', 'legacy_under_13', 'correction_under_13', 'manual')),
  decided_at timestamptz not null default now()
);
comment on table public.account_eligibility is 'PRIVATE. A row here = the account may not use authenticated services (Ineligible / under review). No row = no eligibility restriction.';
-- Phase 4: where the safe cleanup of an Ineligible account stands. pending = not decided yet (the retry job picks it up);
-- removing = handed to the account-deletion workflow (login hard-deleted later; this row then disappears with it);
-- locked = kept, restricted and hidden, because it holds records that must be preserved (review_reasons = record KINDS).
alter table public.account_eligibility add column if not exists cleanup_state text not null default 'pending';
alter table public.account_eligibility drop constraint if exists account_eligibility_cleanup_state_check;
alter table public.account_eligibility add constraint account_eligibility_cleanup_state_check check (cleanup_state in ('pending', 'removing', 'locked'));
alter table public.account_eligibility add column if not exists review_reasons text[] not null default '{}';
alter table public.account_eligibility add column if not exists cleanup_at timestamptz;

create table if not exists public.terms_acceptances (
  account_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  method text not null check (method in ('signup', 'oauth', 'reaccept')),
  primary key (account_id, document, version)
);
comment on table public.terms_acceptances is 'PRIVATE. Terms of Service AGREED / Privacy Policy ACKNOWLEDGED, per document version.';

-- Invitation INTENT held while the account is Pending. Only the hash of the invite secret is kept (the same hash
-- golf_trip_members already stores); the raw link secret is never stored. Nothing here changes a membership.
create table if not exists public.pending_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('golf_trip')),
  invite_token_hash text not null,
  golf_trip_member_id uuid references public.golf_trip_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text check (outcome in ('accepted', 'already_member', 'skipped', 'failed')),
  unique (account_id, kind, invite_token_hash)
);

-- Birthday-correction requests and decisions. Stores outcomes only (eligible after: yes/no), never the dates.
create table if not exists public.birthdate_corrections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  eligible_after boolean,
  note text check (note is null or length(note) <= 500)
);
create unique index if not exists birthdate_corrections_one_open on public.birthdate_corrections (account_id) where status = 'open';

do $$
declare
  t text;
begin
  foreach t in array array['account_activation_settings', 'legal_document_versions', 'account_birthdates', 'account_eligibility',
    'terms_acceptances', 'pending_invitations', 'birthdate_corrections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- === Age ================================================================================================================
-- Whole years between the birthdate and a day. Postgres age(): someone born 29 Feb turns a year older on 1 Mar in
-- non-leap years (the approved rule).
create or replace function public.account_age_years(p_birthdate date, p_on date)
returns integer
language sql immutable set search_path = public as $$
  select extract(year from age(p_on, p_birthdate))::integer;
$$;

create or replace function public.account_is_closed(p_account uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_deletions where account_id = p_account)
      or exists (select 1 from profiles where id = p_account and deleted_at is not null);
$$;

-- Active = Finish succeeded, not closed, no eligibility restriction, AND a birthdate on file that is 13+ today.
-- (An activated legacy account with no birthdate yet is NOT active until the Birthday step is done.)
create or replace function public.profile_is_active(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join account_birthdates b on b.account_id = p.id
    where p.id = p_profile and p.activated_at is not null and p.deleted_at is null
      and account_age_years(b.birthdate, current_date) >= 13
      and not exists (select 1 from account_deletions d where d.account_id = p.id)
      and not exists (select 1 from account_eligibility e where e.account_id = p.id));
$$;

-- One word for the server: no_account | closed | ineligible | review | active | active_needs_birthday | pending.
create or replace function public.account_lifecycle_state(p_account uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_activated timestamptz;
  v_status text;
  v_birthdate date;
begin
  if not exists (select 1 from auth.users where id = p_account) and not exists (select 1 from profiles where id = p_account) then
    return 'no_account';
  end if;
  if account_is_closed(p_account) then return 'closed'; end if;
  select status into v_status from account_eligibility where account_id = p_account;
  if v_status is not null then return v_status; end if;
  select activated_at into v_activated from profiles where id = p_account;
  select birthdate into v_birthdate from account_birthdates where account_id = p_account;
  if v_activated is null then return 'pending'; end if;
  if v_birthdate is null then return 'active_needs_birthday'; end if;
  return case when account_age_years(v_birthdate, current_date) >= 13 then 'active' else 'ineligible' end;
end;
$$;

-- === Session revocation ==================================================================================================
-- Ends EVERY sign-in session of the account at once: refresh tokens can't mint new access tokens, and access tokens
-- already issued are refused immediately (Supabase Auth's /user no longer finds the session, and the database's
-- session_is_revoked() / PostgREST pre-request check from account_deletion.sql refuses them). The person can still sign
-- in again — needed to ask for a birthday correction — and is then treated as Ineligible by every account API.
-- Verified locally 2026-10-28; a ban was rejected because already-issued tokens kept database access.
create or replace function public.revoke_account_sessions(p_account uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
begin
  if to_regclass('auth.sessions') is null then
    return 0;
  end if;
  execute 'delete from auth.sessions where user_id = $1' using p_account;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- === Birthday (write once) ===============================================================================================
-- Saves the person's own birthdate ONCE and answers only { eligible }. Under 13 marks the account Ineligible in the same
-- transaction. A second call never changes the date: corrections go through support (admin_correct_birthdate).
create or replace function public.set_my_birthdate(p_account uuid, p_birthdate date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eligible boolean;
  v_activated timestamptz;
begin
  if not exists (select 1 from auth.users where id = p_account) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if account_is_closed(p_account) then
    raise exception 'This account is closed.' using errcode = '42501';
  end if;
  if p_birthdate is null or p_birthdate > current_date or p_birthdate < date '1900-01-01' then
    raise exception 'Enter your real date of birth.' using errcode = '22023';
  end if;
  insert into account_birthdates (account_id, birthdate, source) values (p_account, p_birthdate, 'self')
  on conflict (account_id) do nothing;
  if not found then
    raise exception 'Your birthday is already saved. Contact support to correct it.' using errcode = '22023';
  end if;
  v_eligible := account_age_years(p_birthdate, current_date) >= 13;
  if not v_eligible then
    select activated_at into v_activated from profiles where id = p_account;
    insert into account_eligibility (account_id, status, reason)
    values (p_account, 'ineligible', case when v_activated is null then 'under_13' else 'legacy_under_13' end)
    on conflict (account_id) do nothing;
    perform revoke_account_sessions(p_account);
  end if;
  return jsonb_build_object('eligible', v_eligible);
end;
$$;

-- === Terms ==============================================================================================================
-- Records acceptance of the CURRENT version only (an old or made-up version is refused). Safe to repeat.
create or replace function public.record_terms_acceptance(p_account uuid, p_document text, p_version text, p_method text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  if not exists (select 1 from auth.users where id = p_account) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if account_is_closed(p_account) then
    raise exception 'This account is closed.' using errcode = '42501';
  end if;
  select current_version into v_current from legal_document_versions where document = p_document;
  if v_current is null then
    raise exception 'That document is not available yet.' using errcode = '22023';
  end if;
  if p_version is distinct from v_current then
    raise exception 'That is not the current version.' using errcode = '22023';
  end if;
  insert into terms_acceptances (account_id, document, version, method) values (p_account, p_document, p_version, p_method)
  on conflict (account_id, document, version) do nothing;
  return jsonb_build_object('recorded', true, 'document', p_document, 'version', v_current);
end;
$$;

-- === Invitation intent ===================================================================================================
-- A Pending account keeps a Golf Trip invitation for later. Changes no membership. Safe to repeat.
-- { status: held | not_found, tripId }.
create or replace function public.hold_golf_trip_invitation(p_account uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := golf_trip_invite_hash(p_token);
  v_member golf_trip_members;
begin
  if not exists (select 1 from auth.users where id = p_account) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if account_is_closed(p_account) or exists (select 1 from account_eligibility where account_id = p_account) then
    raise exception 'This account can''t accept invitations.' using errcode = '42501';
  end if;
  select * into v_member from golf_trip_members where invite_token_hash = v_hash;
  if v_member.id is null or v_member.profile_id is not null or v_member.invitation_status <> 'pending' then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into pending_invitations (account_id, kind, invite_token_hash, golf_trip_member_id)
  values (p_account, 'golf_trip', v_hash, v_member.id)
  on conflict (account_id, kind, invite_token_hash) do nothing;
  return jsonb_build_object('status', 'held', 'tripId', v_member.golf_trip_id);
end;
$$;

-- Internal: the same rules as accept_golf_trip_invitation (golf_trip_invitations.sql), keyed by the stored hash.
-- Never overwrites an existing member or organizer row; a revoked link (hash cleared / replaced) or a declined
-- invitation is 'not_found'.
create or replace function public.activation_accept_golf_trip(p_profile uuid, p_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member golf_trip_members;
begin
  select * into v_member from golf_trip_members where invite_token_hash = p_hash for update;
  if v_member.id is null or (v_member.profile_id is null and v_member.invitation_status <> 'pending') then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_member.profile_id = p_profile then
    return jsonb_build_object('status', 'already_member', 'tripId', v_member.golf_trip_id);
  end if;
  if v_member.profile_id is not null then
    return jsonb_build_object('status', 'claimed');
  end if;
  if exists (select 1 from golf_trip_members where golf_trip_id = v_member.golf_trip_id and profile_id = p_profile) then
    return jsonb_build_object('status', 'already_member', 'tripId', v_member.golf_trip_id);
  end if;
  update golf_trip_members set profile_id = p_profile, invitation_status = 'accepted', claimed_at = now()
  where id = v_member.id and profile_id is null;
  return jsonb_build_object('status', 'accepted', 'tripId', v_member.golf_trip_id);
end;
$$;

-- === Finish =============================================================================================================
-- The ONLY way to activate a profile. Idempotent and safe under concurrent calls (the profile row is locked; the second
-- call sees activated_at and answers "already"). Never activates a closed, ineligible or incomplete account.
-- { activated: true, already, invitations } or { activated: false, missing: [...] | state }.
-- Held invitations are processed AFTER activation, each in its own sub-transaction: one failing never undoes activation.
create or replace function public.activate_my_profile(p_account uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_confirmed timestamptz;
  v_birthdate date;
  v_missing text[] := '{}';
  v_doc text;
  v_version text;
  v_visibility text;
  v_held record;
  v_result jsonb;
  v_outcome text;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not coalesce((select activation_enabled from account_activation_settings where id), false) then
    raise exception 'Activation is not enabled yet.' using errcode = '55000';
  end if;
  select confirmed_at into v_confirmed from auth.users where id = p_account;
  if not found then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  select * into v_profile from profiles where id = p_account for update;
  if not found then
    return jsonb_build_object('activated', false, 'missing', jsonb_build_array('profile'));
  end if;
  if account_is_closed(p_account) then
    raise exception 'This account is closed.' using errcode = '42501';
  end if;
  if exists (select 1 from account_eligibility where account_id = p_account) then
    return jsonb_build_object('activated', false, 'state', (select status from account_eligibility where account_id = p_account));
  end if;
  if v_profile.activated_at is not null then
    return jsonb_build_object('activated', true, 'already', true, 'invitations', '[]'::jsonb);
  end if;

  if v_confirmed is null then v_missing := array_append(v_missing, 'verification'); end if;
  select birthdate into v_birthdate from account_birthdates where account_id = p_account;
  if v_birthdate is null then
    v_missing := array_append(v_missing, 'birthday');
  elsif account_age_years(v_birthdate, current_date) < 13 then
    return jsonb_build_object('activated', false, 'state', 'ineligible');
  end if;
  if profile_display_name_problem(v_profile.display_name) is not null then v_missing := array_append(v_missing, 'name'); end if;
  if v_profile.username is null or v_profile.username !~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$'
     or exists (select 1 from profiles o where o.id <> p_account and lower(o.username) = lower(v_profile.username)) then
    v_missing := array_append(v_missing, 'username');
  end if;
  foreach v_doc in array array['terms', 'privacy'] loop
    select current_version into v_version from legal_document_versions where document = v_doc;
    if v_version is null then
      v_missing := array_append(v_missing, v_doc || '_not_configured');
    elsif not exists (select 1 from terms_acceptances where account_id = p_account and document = v_doc and version = v_version) then
      v_missing := v_missing || v_doc;
    end if;
  end loop;
  v_visibility := to_jsonb(v_profile)->>'rounds_visibility';
  if v_visibility is null or v_visibility not in ('public', 'private') then v_missing := array_append(v_missing, 'privacy_setting'); end if;

  if cardinality(v_missing) > 0 then
    return jsonb_build_object('activated', false, 'missing', to_jsonb(v_missing));
  end if;

  perform set_config('maroon.activation', 'on', true);
  update profiles set activated_at = now() where id = p_account;
  perform set_config('maroon.activation', 'off', true);

  for v_held in select * from pending_invitations where account_id = p_account and processed_at is null order by created_at for update loop
    begin
      v_result := activation_accept_golf_trip(p_account, v_held.invite_token_hash);
      v_outcome := case v_result->>'status' when 'accepted' then 'accepted' when 'already_member' then 'already_member' else 'skipped' end;
    exception when others then
      v_result := '{}'::jsonb;
      v_outcome := 'failed';
    end;
    update pending_invitations set processed_at = now(), outcome = v_outcome where id = v_held.id;
    v_invitations := v_invitations || jsonb_build_object('kind', v_held.kind, 'tripId', v_result->'tripId', 'outcome', v_outcome);
  end loop;

  return jsonb_build_object('activated', true, 'already', false, 'invitations', v_invitations);
end;
$$;

-- === Ineligible registrations ============================================================================================
-- Is it safe to remove this Ineligible account entirely, or must it only be locked? Returns blockers (record kinds,
-- never the records). With p_remove = true and no blockers it also starts the EXISTING deletion workflow
-- (request_account_deletion: profile becomes an anonymous tombstone, login hard-deleted by the server afterwards) and
-- drops the private rows now (birthdate, Terms, held invitations, correction requests). Never touches other accounts.
create or replace function public.account_has_rows(p_table text, p_column text, p_account uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_found boolean;
begin
  if to_regclass('public.' || p_table) is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = p_column) then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where %I = $1)', p_table, p_column) into v_found using p_account;
  return v_found;
end;
$$;

-- Catch-all: any OTHER public table row that points at this account (by a foreign key to profiles / auth.users, or a
-- known profile_id column without one). Returns "table.column" names only. Tables that hold only this account's own
-- private onboarding data, and the pairs checked by name in close_ineligible_registration, are skipped.
create or replace function public.account_other_references(p_account uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_found boolean;
  v_refs text[] := '{}';
  v_private text[] := array['profiles', 'account_birthdates', 'account_eligibility', 'terms_acceptances', 'pending_invitations',
    'birthdate_corrections', 'account_deletions', 'account_deletion_events', 'account_activation_settings', 'legal_document_versions'];
  v_named text[] := array['golf_trip_members.profile_id', 'golf_trips.created_by', 'code_tournament_players.profile_id',
    'player_rounds.profile_id', 'shared_round_players.profile_id', 'scoring_group_players.profile_id',
    'profile_friend_requests.from_profile', 'profile_friend_requests.to_profile', 'player_slots.claimed_by',
    'player_claim_invitations.account_id'];
begin
  for r in
    select distinct t.relname::text as tbl, a.attname::text as col
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and cardinality(c.conkey) = 1 and n.nspname = 'public'
      and (c.confrelid = to_regclass('public.profiles') or c.confrelid = to_regclass('auth.users'))
    union
    select x.tbl, 'profile_id' from unnest(array['code_tournament_holes', 'code_tournament_cards']) x(tbl) where to_regclass('public.' || x.tbl) is not null
  loop
    continue when r.tbl = any(v_private) or (r.tbl || '.' || r.col) = any(v_named);
    execute format('select exists (select 1 from public.%I where %I = $1)', r.tbl, r.col) into v_found using p_account;
    if v_found then v_refs := array_append(v_refs, r.tbl || '.' || r.col); end if;
  end loop;
  return v_refs;
end;
$$;

-- Is it safe to remove this Ineligible account entirely, or must it only be locked? Serialized per account (row lock),
-- so concurrent calls make one decision. p_remove = false is a dry run (changes nothing). With p_remove = true:
--   * any blocker -> cleanup_state 'locked' + review_reasons (record KINDS only); nothing deleted;
--   * no blocker  -> the private onboarding rows go now (birthdate, Terms, held invitations, correction requests) and the
--     EXISTING deletion workflow starts (request_account_deletion: ledger + tombstone; the server then runs its storage
--     and login steps); cleanup_state 'removing'. A repeat call answers the same decision and starts nothing new.
create or replace function public.close_ineligible_registration(p_account uuid, p_remove boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row account_eligibility;
  v_blockers text[] := '{}';
  v_ref text;
begin
  select * into v_row from account_eligibility where account_id = p_account for update;
  if v_row.account_id is null or v_row.status <> 'ineligible' then
    raise exception 'Only Ineligible accounts can be closed this way.' using errcode = '42501';
  end if;
  if v_row.cleanup_state = 'removing' then
    return jsonb_build_object('action', 'remove', 'blockers', '[]'::jsonb, 'started', true, 'already', true);
  end if;
  if exists (select 1 from profiles where id = p_account and activated_at is not null) then v_blockers := array_append(v_blockers, 'activated'); end if;
  if exists (select 1 from profiles where id = p_account and player_slug is not null)
     or account_has_rows('player_slots', 'claimed_by', p_account)
     or account_has_rows('player_claim_invitations', 'account_id', p_account) then v_blockers := array_append(v_blockers, 'player_claim'); end if;
  if account_has_rows('golf_trips', 'created_by', p_account) then v_blockers := array_append(v_blockers, 'trip_owner'); end if;
  if account_has_rows('golf_trip_members', 'profile_id', p_account) then v_blockers := array_append(v_blockers, 'trip_membership'); end if;
  if account_has_rows('code_tournament_players', 'profile_id', p_account) then v_blockers := array_append(v_blockers, 'tournament_membership'); end if;
  if account_has_rows('player_rounds', 'profile_id', p_account) or account_has_rows('shared_round_players', 'profile_id', p_account)
     or account_has_rows('scoring_group_players', 'profile_id', p_account) then v_blockers := array_append(v_blockers, 'rounds'); end if;
  if account_has_rows('profile_friend_requests', 'from_profile', p_account) or account_has_rows('profile_friend_requests', 'to_profile', p_account) then
    v_blockers := array_append(v_blockers, 'friends');
  end if;
  if exists (select 1 from pending_invitations where account_id = p_account and outcome in ('accepted', 'already_member')) then
    v_blockers := array_append(v_blockers, 'invitation_accepted');
  end if;
  foreach v_ref in array account_other_references(p_account) loop
    v_blockers := array_append(v_blockers, 'records:' || v_ref);
  end loop;

  if cardinality(v_blockers) > 0 then
    if p_remove then
      update account_eligibility set cleanup_state = 'locked', review_reasons = v_blockers, cleanup_at = now() where account_id = p_account;
    end if;
    return jsonb_build_object('action', 'lock', 'blockers', to_jsonb(v_blockers));
  end if;
  if p_remove then
    delete from pending_invitations where account_id = p_account;
    delete from terms_acceptances where account_id = p_account;
    delete from birthdate_corrections where account_id = p_account;
    delete from account_birthdates where account_id = p_account;
    perform request_account_deletion(p_account);
    update account_eligibility set cleanup_state = 'removing', review_reasons = '{}', cleanup_at = now() where account_id = p_account;
  end if;
  return jsonb_build_object('action', 'remove', 'blockers', '[]'::jsonb, 'started', p_remove);
end;
$$;

-- Ineligible accounts whose cleanup hasn't been decided yet (e.g. the server stopped between the birthday and the
-- cleanup). Ids only; the retry job feeds them back through the same decision.
create or replace function public.pending_ineligible_cleanups(p_limit integer default 50)
returns table (account_id uuid)
language sql stable security definer set search_path = public as $$
  select e.account_id from account_eligibility e
  where e.status = 'ineligible' and e.cleanup_state = 'pending'
  order by e.decided_at limit greatest(1, least(p_limit, 200));
$$;

-- === Onboarding progress (read only; for the resume API) =================================================================
-- Yes/no facts only: never the birthdate, versions accepted, or anything about other accounts.
create or replace function public.account_onboarding_progress(p_account uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'verified', exists (select 1 from auth.users where id = p_account and confirmed_at is not null),
    'birthday', exists (select 1 from account_birthdates where account_id = p_account),
    'termsConfigured', exists (select 1 from legal_document_versions where document = 'terms')
                       and exists (select 1 from legal_document_versions where document = 'privacy'),
    'termsAccepted', not exists (
      select 1 from legal_document_versions v
      where not exists (select 1 from terms_acceptances a where a.account_id = p_account and a.document = v.document and a.version = v.current_version)),
    'activationEnabled', coalesce((select activation_enabled from account_activation_settings where id), false));
$$;

-- === Birthday correction (support process) ===============================================================================
-- At most one OPEN request, and at most 3 requests in any 30 days (stops a person from cycling requests).
create or replace function public.request_birthdate_correction(p_account uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from account_birthdates where account_id = p_account) then
    raise exception 'There is no birthday to correct.' using errcode = '22023';
  end if;
  if account_is_closed(p_account) then
    raise exception 'This account is closed.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Tell us what is wrong (up to 500 characters).' using errcode = '22023';
  end if;
  if (select count(*) from birthdate_corrections where account_id = p_account and requested_at > now() - interval '30 days') >= 3 then
    raise exception 'Too many correction requests. Contact support.' using errcode = '54000';
  end if;
  begin
    insert into birthdate_corrections (account_id, reason) values (p_account, trim(p_reason)) returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an open correction request.' using errcode = '22023';
  end;
  return jsonb_build_object('requestId', v_id);
end;
$$;

-- Platform admin applies an OPEN request after verifying it with the person (evidence when eligibility would change).
-- Re-evaluates eligibility at once: under 13 -> Ineligible; 13+ -> any age restriction lifted. Audit keeps outcome only.
create or replace function public.admin_correct_birthdate(p_admin uuid, p_request uuid, p_birthdate date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request birthdate_corrections;
  v_eligible boolean;
begin
  if not exists (select 1 from profiles where id = p_admin and platform_role = 'admin' and deleted_at is null) then
    raise exception 'Only a platform admin can correct a birthday.' using errcode = '42501';
  end if;
  select * into v_request from birthdate_corrections where id = p_request for update;
  if v_request.id is null or v_request.status <> 'open' then
    raise exception 'That request is not open.' using errcode = '22023';
  end if;
  if p_birthdate is null or p_birthdate > current_date or p_birthdate < date '1900-01-01' then
    raise exception 'Enter a real date of birth.' using errcode = '22023';
  end if;
  update account_birthdates set birthdate = p_birthdate, source = 'admin_correction', corrected_at = now()
  where account_id = v_request.account_id;
  v_eligible := account_age_years(p_birthdate, current_date) >= 13;
  if v_eligible then
    delete from account_eligibility where account_id = v_request.account_id and reason in ('under_13', 'legacy_under_13', 'correction_under_13');
  else
    insert into account_eligibility (account_id, status, reason) values (v_request.account_id, 'ineligible', 'correction_under_13')
    on conflict (account_id) do update set status = 'ineligible', reason = 'correction_under_13', decided_at = now(),
      cleanup_state = 'pending', review_reasons = '{}', cleanup_at = null;
    perform revoke_account_sessions(v_request.account_id);
  end if;
  update birthdate_corrections set status = 'approved', decided_at = now(), decided_by = p_admin, eligible_after = v_eligible, note = p_note
  where id = p_request;
  return jsonb_build_object('eligible', v_eligible);
end;
$$;

create or replace function public.admin_reject_birthdate_correction(p_admin uuid, p_request uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_admin and platform_role = 'admin' and deleted_at is null) then
    raise exception 'Only a platform admin can decide a correction.' using errcode = '42501';
  end if;
  update birthdate_corrections set status = 'rejected', decided_at = now(), decided_by = p_admin, note = p_note
  where id = p_request and status = 'open';
  if not found then
    raise exception 'That request is not open.' using errcode = '22023';
  end if;
  return jsonb_build_object('rejected', true);
end;
$$;

-- === Legacy accounts: READ-ONLY dry-run inventory ========================================================================
-- Classifies every profile for the (separately approved) legacy backfill. Returns account ids and reason codes only:
-- no names, emails, usernames or dates. Changes nothing.
--   already_active      activated_at is set
--   deleted             tombstone (deleted_at) or in the deletion ledger
--   restricted          eligibility restriction, banned or soft-deleted login
--   incomplete          username or display name missing
--   review              complete, but something needs a person to look first (see reason codes)
--   eligible_completed  complete, verified, valid unique username, matching email, consistent player claim, no flags
create or replace function public.legacy_activation_classify()
returns table (account_id uuid, category text, reasons text[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_has_claims boolean := to_regclass('public.player_claim_invitations') is not null;
  v_has_banned boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until');
  v_has_softdel boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'deleted_at');
  r record;
  v_reasons text[];
  v_banned boolean;
  v_softdel boolean;
begin
  for r in
    select p.id, p.username, p.display_name, p.email as profile_email, p.player_slug, p.deleted_at, p.activated_at,
           u.id as user_id, u.email as auth_email, u.confirmed_at
    from profiles p left join auth.users u on u.id = p.id
    order by p.id
  loop
    account_id := r.id;
    reasons := '{}';
    if r.activated_at is not null then
      category := 'already_active'; return next; continue;
    end if;
    if r.deleted_at is not null or exists (select 1 from account_deletions d where d.account_id = r.id) then
      category := 'deleted'; return next; continue;
    end if;
    v_banned := false; v_softdel := false;
    if r.user_id is not null and v_has_banned then
      execute 'select coalesce(banned_until > now(), false) from auth.users where id = $1' into v_banned using r.id;
    end if;
    if r.user_id is not null and v_has_softdel then
      execute 'select deleted_at is not null from auth.users where id = $1' into v_softdel using r.id;
    end if;
    v_reasons := '{}';
    if exists (select 1 from account_eligibility e where e.account_id = r.id) then v_reasons := array_append(v_reasons, 'eligibility_restriction'); end if;
    if v_banned then v_reasons := array_append(v_reasons, 'login_banned'); end if;
    if v_softdel then v_reasons := array_append(v_reasons, 'login_soft_deleted'); end if;
    if cardinality(v_reasons) > 0 then
      category := 'restricted'; reasons := v_reasons; return next; continue;
    end if;
    if coalesce(btrim(r.username), '') = '' or coalesce(btrim(r.display_name), '') = '' then
      category := 'incomplete'; return next; continue;
    end if;
    if r.user_id is null then v_reasons := array_append(v_reasons, 'no_login'); end if;
    if r.user_id is not null and r.confirmed_at is null then v_reasons := array_append(v_reasons, 'email_unverified'); end if;
    if r.username !~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$' then v_reasons := array_append(v_reasons, 'username_format'); end if;
    if exists (select 1 from profiles o where o.id <> r.id and lower(o.username) = lower(r.username)) then v_reasons := array_append(v_reasons, 'username_duplicate'); end if;
    if r.user_id is not null and lower(coalesce(r.profile_email, '')) <> lower(coalesce(r.auth_email, '')) then v_reasons := array_append(v_reasons, 'email_mismatch'); end if;
    if r.player_slug is not null and not exists (select 1 from player_slots s where s.player_slug = r.player_slug and s.claimed_by = r.id) then
      v_reasons := array_append(v_reasons, 'player_claim_mismatch');
    end if;
    if exists (select 1 from player_slots s where s.claimed_by = r.id and s.player_slug is distinct from r.player_slug) then
      v_reasons := array_append(v_reasons, 'player_claim_mismatch');
    end if;
    if v_has_claims then
      execute 'select exists (select 1 from player_claim_invitations where account_id = $1)' into v_banned using r.id;
      if v_banned then v_reasons := array_append(v_reasons, 'pending_player_claim'); end if;
    end if;
    if cardinality(v_reasons) > 0 then
      category := 'review'; reasons := (select array_agg(distinct x order by x) from unnest(v_reasons) x); return next; continue;
    end if;
    category := 'eligible_completed'; return next;
  end loop;
end;
$$;

-- Counts only (no ids), for the report.
create or replace function public.legacy_activation_inventory()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from legacy_activation_classify()),
    'categories', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from legacy_activation_classify() group by 1) c), '{}'::jsonb),
    'reasons', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) n from legacy_activation_classify(), unnest(reasons) reason group by 1) x), '{}'::jsonb));
$$;

-- === Privileges: server only ==============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.guard_profile_activation()', 'public.account_is_closed(uuid)', 'public.profile_is_active(uuid)',
    'public.account_lifecycle_state(uuid)', 'public.set_my_birthdate(uuid, date)', 'public.record_terms_acceptance(uuid, text, text, text)',
    'public.hold_golf_trip_invitation(uuid, text)', 'public.activation_accept_golf_trip(uuid, text)', 'public.activate_my_profile(uuid)',
    'public.account_has_rows(text, text, uuid)', 'public.close_ineligible_registration(uuid, boolean)',
    'public.request_birthdate_correction(uuid, text)', 'public.admin_correct_birthdate(uuid, uuid, date, text)',
    'public.admin_reject_birthdate_correction(uuid, uuid, text)', 'public.legacy_activation_classify()', 'public.legacy_activation_inventory()',
    'public.account_onboarding_progress(uuid)', 'public.revoke_account_sessions(uuid)', 'public.account_other_references(uuid)',
    'public.pending_ineligible_cleanups(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.account_is_closed(uuid)', 'public.profile_is_active(uuid)', 'public.account_lifecycle_state(uuid)',
    'public.set_my_birthdate(uuid, date)', 'public.record_terms_acceptance(uuid, text, text, text)', 'public.hold_golf_trip_invitation(uuid, text)',
    'public.activate_my_profile(uuid)', 'public.close_ineligible_registration(uuid, boolean)', 'public.request_birthdate_correction(uuid, text)',
    'public.admin_correct_birthdate(uuid, uuid, date, text)', 'public.admin_reject_birthdate_correction(uuid, uuid, text)',
    'public.legacy_activation_classify()', 'public.legacy_activation_inventory()', 'public.account_onboarding_progress(uuid)', 'public.revoke_account_sessions(uuid)',
    'public.pending_ineligible_cleanups(integer)'] loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- === Undo (only before any account is activated) =========================================================================
-- drop trigger if exists guard_profile_activation on public.profiles;
-- drop function if exists public.pending_ineligible_cleanups(integer), public.account_other_references(uuid),
--   public.revoke_account_sessions(uuid), public.account_onboarding_progress(uuid), public.legacy_activation_inventory(), public.legacy_activation_classify(),
--   public.admin_reject_birthdate_correction(uuid, uuid, text), public.admin_correct_birthdate(uuid, uuid, date, text),
--   public.request_birthdate_correction(uuid, text), public.close_ineligible_registration(uuid, boolean),
--   public.account_has_rows(text, text, uuid), public.activate_my_profile(uuid), public.activation_accept_golf_trip(uuid, text),
--   public.hold_golf_trip_invitation(uuid, text), public.record_terms_acceptance(uuid, text, text, text),
--   public.set_my_birthdate(uuid, date), public.account_lifecycle_state(uuid), public.profile_is_active(uuid),
--   public.account_is_closed(uuid), public.account_age_years(date, date), public.guard_profile_activation();
-- drop table if exists public.birthdate_corrections, public.pending_invitations, public.terms_acceptances,
--   public.account_eligibility, public.account_birthdates, public.legal_document_versions, public.account_activation_settings;
-- alter table public.profiles drop column if exists activated_at;
