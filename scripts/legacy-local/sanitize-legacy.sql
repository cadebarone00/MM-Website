-- scripts/legacy-local/sanitize-legacy.sql — LOCAL maroon-legacy copy ONLY (run by sanitize.mjs inside the local
-- container; never on a hosted project). Turns a raw restored production copy into a test copy:
--
--   REMOVED   real password hashes, every token (confirmation / recovery / email-change / reauthentication / phone),
--             sessions, refresh tokens, MFA, one-time codes, half-finished OAuth sign-ins, the sign-in log,
--             Google / Apple identities (real provider ids), login metadata (provider names / pictures), phone numbers,
--             typed-in emails and phone numbers in public tables, browser push subscriptions (real device endpoints).
--   REPLACED  login emails -> legacy-NN@legacy.invalid (.invalid can never receive mail); profiles.email to match; every
--             login gets an email sign-in identity and the ONE test password typed into sanitize.mjs (never stored).
--   DISABLED  any trigger that could call the internet (pg_net / http / dblink webhooks) and any pg_cron job.
--   ANONYMIZED (owner decision 2026-10-30) private account names / usernames / bios -> "Legacy Golfer NN" / legacy_NN,
--             typed-in trip member names, claim-invitation names, customer-tournament player names.
--   KEPT      public Maroon Masters archive names (player records, career / archive tables, The Maroon's tournament
--             players), profile photos (this local copy only), and every golf relationship (same ids, so trips, rounds,
--             members and claims still connect).
--
-- One transaction: the checks at the end raise an error (undoing everything) if anything real is left.
-- Requires psql variable test_password (12+ characters). Prints counts only.

\set ON_ERROR_STOP on
\if :{?test_password}
\else
  do $$ begin raise exception 'psql variable test_password is not set. Nothing was changed.'; end $$;
\endif
begin;
set local search_path = public, extensions, auth;
-- Transaction-local; \gset swallows the result so the password is never printed.
select set_config('legacy.test_password', :'test_password', true) as ignored \gset _

do $$ begin
  if length(coalesce(current_setting('legacy.test_password', true), '')) < 12 then
    raise exception 'A test password of at least 12 characters is required. Nothing was changed.';
  end if;
  if to_regclass('legacy_meta.restore_log') is null or not exists (select 1 from legacy_meta.restore_log) then
    raise exception 'This database was not restored by restore-local.mjs (no legacy_meta.restore_log). Nothing was changed.';
  end if;
end $$;

-- === 1. Stable labels: legacy-01, legacy-02 ... in sign-up order (no real data kept in the map) ======================
create table if not exists legacy_meta.identity_map (account_id uuid primary key, label text not null unique);
insert into legacy_meta.identity_map (account_id, label)
select id, 'legacy-' || lpad(row_number() over (order by created_at, id)::text, 2, '0') from auth.users
on conflict (account_id) do nothing;

-- === 2. Logins: test email, test password, no tokens, no phone, no provider metadata =================================
update auth.users u set
  email = m.label || '@legacy.invalid',
  encrypted_password = extensions.crypt(current_setting('legacy.test_password'), extensions.gen_salt('bf')),
  phone = null,
  raw_user_meta_data = '{}'::jsonb,
  raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'))
from legacy_meta.identity_map m where m.account_id = u.id;

do $$
declare c text;
begin
  -- Token / pending-change columns differ between Supabase Auth versions: clear whichever exist.
  for c in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
    and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change', 'email_change_token_current',
                        'reauthentication_token', 'phone_change', 'phone_change_token') loop
    execute format('update auth.users set %I = %L where coalesce(%I, '''') <> ''''', c, '', c);
  end loop;
  for c in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
    and column_name in ('phone_confirmed_at', 'phone_change_sent_at', 'email_change_sent_at', 'recovery_sent_at', 'reauthentication_sent_at') loop
    execute format('update auth.users set %I = null where %I is not null', c, c);
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user') then
    update auth.users set is_sso_user = false where is_sso_user;
  end if;
end $$;

-- === 3. Sign-in identities: only email, pointing at the test email ====================================================
delete from auth.identities where provider <> 'email';
update auth.identities i set provider_id = i.user_id::text,
  identity_data = jsonb_build_object('sub', i.user_id::text, 'email', u.email, 'email_verified', u.email_confirmed_at is not null, 'phone_verified', false)
from auth.users u where u.id = i.user_id and i.provider = 'email';
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', u.email_confirmed_at is not null, 'phone_verified', false), 'email', now(), now()
from auth.users u where not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- === 4. Everything that proves or continues a real sign-in ============================================================
do $$
declare t text;
begin
  foreach t in array array['sessions', 'refresh_tokens', 'mfa_amr_claims', 'mfa_challenges', 'mfa_factors', 'one_time_tokens',
                           'flow_state', 'audit_log_entries', 'saml_relay_states'] loop
    if to_regclass('auth.' || t) is not null then execute format('delete from auth.%I', t); end if;
  end loop;
end $$;

-- === 5. Public tables: profile email matches the test login; typed-in emails / phones removed; push endpoints removed ==
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- Owner decision 2026-10-30 (G4 approval, item 4): PRIVATE account names, usernames and bios are anonymized. Public
-- Maroon Masters archive names stay: player_slots (full_name, MM codes), career / archive tables, and The Maroon's own
-- tournament players. Profile photos stay (local copy only).
update public.profiles p set display_name = 'Legacy Golfer ' || substr(m.label, 8), username = replace(m.label, '-', '_')
from legacy_meta.identity_map m where m.account_id = p.id;
-- Profiles with no login behind them (orphans) get a label from their id instead.
update public.profiles p set display_name = 'Legacy Golfer ' || substr(md5(p.id::text), 1, 6), username = 'legacy_' || substr(md5(p.id::text), 1, 8)
where not exists (select 1 from legacy_meta.identity_map m where m.account_id = p.id) and p.display_name is not null;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'bio') then
    execute 'update public.profiles set bio = null where bio is not null';
  end if;
  if to_regclass('public.golf_trip_members') is not null then
    update public.golf_trip_members set display_name = 'Trip Golfer ' || substr(md5(id::text), 1, 6);
  end if;
  if to_regclass('public.player_claim_invitations') is not null then
    update public.player_claim_invitations set display_name = null where display_name is not null;
  end if;
  -- Customer (non-Maroon) tournament players are private; The Maroon's are public archive names and stay.
  if to_regclass('public.tournament_players') is not null and to_regclass('public.tournaments') is not null then
    update public.tournament_players tp set display_name = 'Player ' || substr(md5(tp.id::text), 1, 6)
    from public.tournaments t where t.id = tp.tournament_id and not t.is_legacy;
  end if;
end $$;

do $$
declare c record;
begin
  for c in select col.table_name, col.column_name, col.is_nullable from information_schema.columns col
    join pg_class k on k.relname = col.table_name join pg_namespace n on n.oid = k.relnamespace and n.nspname = col.table_schema
    where col.table_schema = 'public' and k.relkind = 'r' and col.data_type in ('text', 'character varying', 'citext')
      and col.column_name ~ '(^|_)(email|phone|phone_number|mobile)($|_)'
      and not (col.table_name = 'profiles' and col.column_name = 'email') loop
    if c.is_nullable = 'YES' then
      execute format('update public.%I set %I = null where %I is not null', c.table_name, c.column_name, c.column_name);
    else
      execute format('update public.%I set %I = %L where %I <> %L', c.table_name, c.column_name,
        case when c.column_name ~ 'email' then 'redacted@legacy.invalid' else '' end, c.column_name,
        case when c.column_name ~ 'email' then 'redacted@legacy.invalid' else '' end);
    end if;
  end loop;
  if to_regclass('public.trip_push_subscriptions') is not null then delete from public.trip_push_subscriptions; end if;
end $$;

-- === 6. Nothing may reach the internet: webhook triggers off, scheduled jobs off ======================================
create table if not exists legacy_meta.disabled_triggers (table_name text, trigger_name text, disabled_at timestamptz default now());
do $$
declare t record;
begin
  for t in select n.nspname, c.relname, tg.tgname from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = tg.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
    where not tg.tgisinternal and tg.tgenabled <> 'D'
      and (pn.nspname in ('net', 'supabase_functions') or p.prosrc ~* '(net\.http_|http_(get|post|put|patch|delete)\s*\(|dblink|supabase_functions\.http_request)') loop
    execute format('alter table %I.%I disable trigger %I', t.nspname, t.relname, t.tgname);
    insert into legacy_meta.disabled_triggers (table_name, trigger_name) values (t.nspname || '.' || t.relname, t.tgname);
  end loop;
  if to_regclass('cron.job') is not null then execute 'update cron.job set active = false where active'; end if;
end $$;

-- === 7. Checks: anything real left undoes the whole run ==============================================================
do $$
declare c record; v bigint;
begin
  if exists (select 1 from auth.users where email !~ '^legacy-[0-9]+@legacy\.invalid$') then raise exception 'A login still has a real email.'; end if;
  if exists (select 1 from auth.users where encrypted_password is null or encrypted_password <> extensions.crypt(current_setting('legacy.test_password'), encrypted_password)) then
    raise exception 'A login still has a real (or no) password.'; end if;
  if exists (select 1 from auth.users where phone is not null) then raise exception 'A login still has a phone number.'; end if;
  if exists (select 1 from auth.identities where provider <> 'email' or identity_data ->> 'email' !~ '@legacy\.invalid$') then raise exception 'A sign-in identity is still real.'; end if;
  if exists (select 1 from auth.users u where not exists (select 1 from auth.identities i where i.user_id = u.id)) then raise exception 'A login has no sign-in identity.'; end if;
  if exists (select 1 from public.profiles p join auth.users u on u.id = p.id where p.email <> u.email) then raise exception 'A profile email does not match its test login.'; end if;
  if exists (select 1 from public.profiles p join legacy_meta.identity_map m on m.account_id = p.id
             where p.display_name is distinct from 'Legacy Golfer ' || substr(m.label, 8) or p.username is distinct from replace(m.label, '-', '_')) then
    raise exception 'A private profile name or username was not anonymized.'; end if;
  for c in select table_name, column_name from information_schema.columns where table_schema = 'public'
    and data_type in ('text', 'character varying', 'citext') and column_name ~ '(^|_)(email|phone|phone_number|mobile)($|_)' loop
    execute format('select count(*) from public.%I where %I ~ ''@'' and %I !~ ''@legacy\.invalid$''', c.table_name, c.column_name, c.column_name) into v;
    if v > 0 then raise exception 'public.%.% still holds % real email address(es).', c.table_name, c.column_name, v; end if;
  end loop;
  if to_regclass('public.trip_push_subscriptions') is not null then
    execute 'select count(*) from public.trip_push_subscriptions' into v;  -- dynamic: the table may not be installed
    if v > 0 then raise exception 'Push subscriptions remain.'; end if;
  end if;
  if exists (select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
             where not tg.tgisinternal and tg.tgenabled <> 'D'
               and (pn.nspname in ('net', 'supabase_functions') or p.prosrc ~* '(net\.http_|http_(get|post|put|patch|delete)\s*\(|dblink|supabase_functions\.http_request)')) then
    raise exception 'A trigger that can call the internet is still enabled.'; end if;
end $$;

insert into legacy_meta.restore_log (backup_id, dump_sha256, state)
select backup_id, dump_sha256, 'sanitized' from legacy_meta.restore_log where state = 'raw' order by restored_at desc limit 1;

select 'logins' as item, count(*)::text as value from auth.users
union all select 'email identities', count(*)::text from auth.identities
union all select 'profiles', count(*)::text from public.profiles
union all select 'profile photos kept', count(*)::text from public.profiles p where to_jsonb(p) ->> 'avatar_path' is not null
union all select 'webhook triggers disabled', count(*)::text from legacy_meta.disabled_triggers;

commit;
