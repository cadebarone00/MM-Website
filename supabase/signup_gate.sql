-- supabase/signup_gate.sql
-- V2 sign-up gate (docs/v2-auth-enforcement-spec-2026-10-30.md; G4 approved 2026-10-30): tester allowlist, birthday-first
-- strict 13+, no direct-API bypass, no new Apple / Google accounts during the beta.
--
-- Two independent locks, both in the database:
--   1. Supabase Auth "Before User Created" hook -> before_user_created_gate(event). It runs inside Supabase Auth for EVERY
--      new login, whichever way the request arrives (our server, the public /auth/v1/signup endpoint with the browser key,
--      OAuth). It refuses unless: registration is open to this email (mode + allowlist), the provider is email, and the
--      sign-up carries a single-use, unexpired age pass bound to THIS email. Passes exist only for people the server
--      found 13+ (issue_age_pass); under-13 submissions are never stored.
--   2. A trigger on profiles: a login created after the gate was installed gets a profile only if its age pass was used
--      for it; the pass's birthdate then moves into account_birthdates (write-once) and the pass is deleted. So even a
--      login created around the hook (hook switched off by mistake, admin API) can never become a golfer.
--
-- The hook is configured in Supabase (Authentication -> Hooks -> Before User Created -> Postgres function
-- public.before_user_created_gate); this file only creates the function. Mode starts 'closed'.
-- Prerequisites: schema.sql, profile_initialization.sql, account_activation.sql (account_birthdates, account_age_years).
-- Safe to run more than once. Undo at the bottom.

begin;

-- === Settings: who may register ======================================================================================
create table if not exists public.registration_settings (
  id boolean primary key default true check (id),
  mode text not null default 'closed' check (mode in ('closed', 'testers', 'open')),
  -- Logins created before this moment (legacy / earlier test accounts) keep the old onboarding birthday step.
  enforced_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.registration_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.signup_allowlist (
  email_normalized text primary key check (email_normalized = lower(btrim(email_normalized)) and email_normalized like '%_@_%'),
  note text check (note is null or length(note) <= 120),
  added_at timestamptz not null default now()
);

-- One row per 13+ result. The birthdate stays here (server only) until the account exists. nonce_hash = SHA-256 of a
-- random 32-byte value the server gave the browser / app; email_hash is set when the sign-up request names its email.
create table if not exists public.age_passes (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  birthdate date not null,
  email_hash text check (email_hash is null or email_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz
);
create index if not exists age_passes_account_idx on public.age_passes (account_id) where account_id is not null;

-- Testers activated without accepting final Terms / Privacy (they must accept the real documents at launch).
create table if not exists public.tester_activations (
  account_id uuid primary key references auth.users(id) on delete cascade,
  activated_at timestamptz not null default now(),
  terms_status text not null default 'not_accepted_preview' check (terms_status = 'not_accepted_preview')
);

alter table public.registration_settings enable row level security;
alter table public.signup_allowlist enable row level security;
alter table public.age_passes enable row level security;
alter table public.tester_activations enable row level security;
revoke all on public.registration_settings, public.signup_allowlist, public.age_passes, public.tester_activations from public, anon, authenticated;

create or replace function public.signup_email_hash(p_email text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;

-- === Server functions (service role only) ============================================================================
-- 13+ today -> a pass for this nonce hash; under 13 -> nothing is stored at all. Old passes are tidied up here (no job).
create or replace function public.issue_age_pass(p_birthdate date, p_nonce_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from age_passes where account_id is null and expires_at < now() - interval '1 day';
  if p_birthdate is null or p_birthdate < date '1900-01-01' or p_birthdate > current_date then
    raise exception 'Enter a real date of birth.' using errcode = '22023';
  end if;
  if account_age_years(p_birthdate, current_date) < 13 then
    return jsonb_build_object('eligible', false);
  end if;
  insert into age_passes (nonce_hash, birthdate) values (p_nonce_hash, p_birthdate);
  return jsonb_build_object('eligible', true);
end;
$$;

-- The sign-up request binds its (live, unused, unbound) pass to the email it names. One pass, one email.
create or replace function public.bind_age_pass(p_nonce_hash text, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update age_passes set email_hash = signup_email_hash(p_email)
  where nonce_hash = p_nonce_hash and used_at is null and expires_at > now()
    and (email_hash is null or email_hash = signup_email_hash(p_email));
  return found;
end;
$$;

-- Is this account a tester in testers mode? (activate_my_profile's tester path; account_activation.sql)
create or replace function public.signup_tester_preview(p_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select mode = 'testers' from registration_settings where id), false)
     and exists (select 1 from signup_allowlist a join auth.users u on lower(u.email) = a.email_normalized where u.id = p_account);
$$;

revoke all on function public.signup_email_hash(text), public.issue_age_pass(date, text), public.bind_age_pass(text, text),
  public.signup_tester_preview(uuid) from public, anon, authenticated;
grant execute on function public.issue_age_pass(date, text), public.bind_age_pass(text, text), public.signup_tester_preview(uuid) to service_role;

-- === Lock 1: the Supabase Auth hook ==================================================================================
create or replace function public.before_user_created_gate(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_email text := lower(btrim(coalesce(v_user ->> 'email', '')));
  v_provider text := coalesce(v_user -> 'app_metadata' ->> 'provider', 'email');
  v_nonce text := v_user -> 'user_metadata' ->> 'age_pass';
  v_mode text;
  v_id uuid;
begin
  select mode into v_mode from registration_settings where id;
  if coalesce(v_mode, 'closed') = 'closed' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Registration is closed.'));
  end if;
  -- Beta: new accounts only by email (Apple / Google sign-up stays off until age enforcement can be shown for them).
  if coalesce((v_user ->> 'is_anonymous')::boolean, false) or v_provider <> 'email' or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'New accounts can only be created with email.'));
  end if;
  if v_mode = 'testers' and not exists (select 1 from signup_allowlist where email_normalized = v_email) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Registration is invite-only right now.'));
  end if;
  if v_nonce is null or v_nonce !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Start with your birthday.'));
  end if;
  begin v_id := (v_user ->> 'id')::uuid; exception when others then v_id := null; end;
  update age_passes set used_at = now(), account_id = v_id
  where nonce_hash = encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex') and used_at is null and expires_at > now()
    and email_hash = signup_email_hash(v_email);
  if not found then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Start with your birthday.'));
  end if;
  return '{}'::jsonb;
end;
$$;
-- Supabase Auth calls hooks as supabase_auth_admin; nobody else may.
revoke all on function public.before_user_created_gate(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_gate(jsonb) to supabase_auth_admin;

-- === Lock 2: no profile without a used age pass ======================================================================
create or replace function public.require_age_pass_for_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_created timestamptz;
  v_pass age_passes;
begin
  select enforced_since into v_since from registration_settings where id;
  select created_at into v_created from auth.users where id = new.id;
  if v_since is null or v_created is null or v_created < v_since then return new; end if;   -- pre-gate login: old flow
  if exists (select 1 from account_birthdates where account_id = new.id) then return new; end if;
  select * into v_pass from age_passes where account_id = new.id and used_at is not null order by used_at desc limit 1;
  if not found or account_age_years(v_pass.birthdate, current_date) < 13 then
    raise exception 'Birthday check required before a profile can be created.' using errcode = '42501';
  end if;
  insert into account_birthdates (account_id, birthdate, source) values (new.id, v_pass.birthdate, 'self');
  delete from age_passes where account_id = new.id;
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'age_pass' where id = new.id;
  return new;
end;
$$;
revoke all on function public.require_age_pass_for_profile() from public, anon, authenticated;
drop trigger if exists require_age_pass_for_profile on public.profiles;
create trigger require_age_pass_for_profile before insert on public.profiles
  for each row execute function public.require_age_pass_for_profile();

commit;

-- Undo (development only): drop trigger require_age_pass_for_profile on public.profiles;
--   drop function public.require_age_pass_for_profile(), public.before_user_created_gate(jsonb), public.signup_tester_preview(uuid),
--   public.bind_age_pass(text, text), public.issue_age_pass(date, text), public.signup_email_hash(text);
--   drop table public.tester_activations, public.age_passes, public.signup_allowlist, public.registration_settings;
--   and switch the hook off in Supabase first.
