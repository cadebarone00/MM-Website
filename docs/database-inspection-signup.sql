-- docs/database-inspection-signup.sql
-- READ-ONLY diagnostic for Accounts Step 2 (signup & profile initialization). Written 2026-10-16.
--
-- What it does: the first line switches this run to READ ONLY (the database refuses any write). Then ONE select that:
--   A. describes ONLY the accounts with no profile and the accounts never verified, by number ("account #1"), with
--      dates and yes/no facts. No ids, emails, names, phone numbers, passwords, hashes, tokens or metadata VALUES
--      (metadata KEY names only).
--   B. shows the SHAPE of profiles / player_slots: columns, constraints, indexes and triggers (no rows).
--   C. shows the installed SOURCE CODE of the signup / profile functions and the legacy auth trigger functions (this
--      is program code, not user data), with who can call each one.
--   D. counts (numbers only) about old Maroon player slots and profile consistency.
--
-- How to run: Supabase dashboard -> SQL Editor (leave the role on the default "postgres") -> New query -> paste
-- this whole file -> Run -> export / download CSV and send it back.
-- Completeness check: row 1 says how many rows there are, and every row has a row_no with no gaps.
-- If Supabase answers with an error about SET TRANSACTION, delete that first line and run again.

set transaction read only;

with
acct as (
  select u.id, u.created_at, u.confirmed_at, u.email_confirmed_at, u.invited_at, u.last_sign_in_at,
    u.confirmation_sent_at, u.is_sso_user, u.is_anonymous, u.banned_until, u.deleted_at,
    u.raw_app_meta_data ->> 'provider' as app_provider,
    (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(u.raw_user_meta_data, '{}'::jsonb)) k) as meta_keys,
    (select string_agg(distinct i.provider, ',' order by i.provider) from auth.identities i where i.user_id = u.id) as providers,
    (select count(*) from auth.identities i where i.user_id = u.id) as identities,
    p.id is not null as has_profile, p.created_at as profile_created_at,
    p.player_slug is not null as profile_has_slot,
    exists (select 1 from public.player_slots s where s.claimed_by = u.id) as claimed_a_slot,
    exists (select 1 from public.player_slots s where s.email is not null and lower(s.email) = lower(u.email) and s.claimed_by is null) as email_matches_unclaimed_slot,
    exists (select 1 from public.player_slots s where s.email is not null and lower(s.email) = lower(u.email) and s.claimed_by is not null) as email_matches_claimed_slot,
    exists (select 1 from public.profiles p2 where p2.id <> u.id and lower(p2.email) = lower(u.email)) as email_used_by_another_profile
  from auth.users u
  left join public.profiles p on p.id = u.id
),
yn as (select true as v, 'yes' as t union all select false, 'no'),
account_rows as (
  select 1 as section_order, 'A. Accounts to explain' as section,
    case when not has_profile then 'NO PROFILE' else 'NEVER VERIFIED' end as kind,
    'account #' || lpad((row_number() over (order by not has_profile desc, created_at))::text, 2, '0') as object,
    concat_ws(' + ', case when not has_profile then 'no profile' end, case when email_confirmed_at is null and confirmed_at is null then 'never verified' end) as status,
    concat_ws('; ',
      'created ' || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
      'confirmed ' || coalesce(to_char(confirmed_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'no'),
      'invited ' || coalesce(to_char(invited_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'no'),
      'confirmation email sent ' || coalesce(to_char(confirmation_sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'no'),
      'last sign-in ' || coalesce(to_char(last_sign_in_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'never'),
      'sign-in methods ' || coalesce(providers, 'none') || ' (' || identities || ')',
      'app provider ' || coalesce(app_provider, 'none'),
      'metadata keys ' || coalesce(nullif(meta_keys, ''), 'none'),
      case when is_sso_user then 'SSO account' end,
      case when is_anonymous then 'anonymous account' end,
      case when banned_until is not null then 'banned' end,
      case when deleted_at is not null then 'soft-deleted' end,
      'profile ' || coalesce('created ' || to_char(profile_created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC', 'none'),
      'profile linked to player slot ' || (select t from yn where v = profile_has_slot),
      'claimed a player slot ' || (select t from yn where v = claimed_a_slot),
      'email matches an UNCLAIMED slot invite ' || (select t from yn where v = email_matches_unclaimed_slot),
      'email matches a CLAIMED slot invite ' || (select t from yn where v = email_matches_claimed_slot),
      'same email as another profile ' || (select t from yn where v = email_used_by_another_profile)) as detail
  from acct
  where not has_profile or (email_confirmed_at is null and confirmed_at is null)
),
column_rows as (
  select 2 as section_order, 'B. Table shape' as section, 'column' as kind,
    c.table_schema || '.' || c.table_name || '.' || c.column_name as object,
    case when c.is_nullable = 'YES' then 'nullable' else 'NOT NULL' end as status,
    c.data_type || coalesce('; default ' || c.column_default, '') as detail
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in ('profiles', 'player_slots')
),
constraint_rows as (
  select 2 as section_order, 'B. Table shape' as section, 'constraint' as kind,
    r.relname || '.' || con.conname as object,
    case con.contype when 'p' then 'primary key' when 'u' then 'unique' when 'f' then 'foreign key' when 'c' then 'check' else con.contype::text end as status,
    pg_get_constraintdef(con.oid) as detail
  from pg_constraint con join pg_class r on r.oid = con.conrelid join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname in ('profiles', 'player_slots')
),
index_rows as (
  select 2 as section_order, 'B. Table shape' as section, 'index' as kind,
    t.relname || '.' || i.relname as object,
    case when x.indisunique then 'unique' else 'not unique' end as status,
    pg_get_indexdef(i.oid) as detail
  from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname in ('profiles', 'player_slots')
),
trigger_rows as (
  select 2 as section_order, 'B. Table shape' as section, 'trigger' as kind,
    n.nspname || '.' || r.relname || '.' || t.tgname as object,
    case t.tgenabled when 'D' then 'disabled' else 'enabled' end as status,
    pg_get_triggerdef(t.oid) as detail
  from pg_trigger t join pg_class r on r.oid = t.tgrelid join pg_namespace n on n.oid = r.relnamespace
  where not t.tgisinternal
    and t.tgrelid in (to_regclass('auth.users'), to_regclass('auth.identities'), to_regclass('public.profiles'), to_regclass('public.player_slots'))
),
function_rows as (
  select 3 as section_order, 'C. Installed function code' as section, 'function' as kind,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object,
    concat_ws(', ',
      case when has_function_privilege('anon', p.oid, 'execute') then 'callable by anon' end,
      case when has_function_privilege('authenticated', p.oid, 'execute') then 'callable by authenticated' end,
      case when has_function_privilege('service_role', p.oid, 'execute') then 'callable by service_role' end,
      case when p.prosecdef then 'security definer' else 'security invoker' end) as status,
    pg_get_functiondef(p.oid) as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'create_my_profile', 'update_my_profile', 'profile_username_problem', 'profile_display_name_problem',
    'profile_id_for_username', 'list_edition_player_profiles',
    'sync_player_slot_password_created', 'derive_player_slot_password_created', 'sync_legacy_tournament_player_profile')
),
count_rows as (
  select 4 as section_order, 'D. Counts (numbers only)' as section, 'count' as kind, lpad(sort::text, 2, '0') || '. ' || label as object, value::text as status, note as detail
  from (values
    (1, 'player slots', (select count(*) from public.player_slots), 'old Maroon players'),
    (2, 'player slots claimed', (select count(*) from public.player_slots where claimed_by is not null), ''),
    (3, 'player slots with an invite email', (select count(*) from public.player_slots where email is not null), 'set when an admin sends an invite'),
    (4, 'claimed slots whose invite email = the claiming account''s email', (select count(*) from public.player_slots s join auth.users u on u.id = s.claimed_by
        where s.email is not null and lower(s.email) = lower(u.email)), 'would also pass the planned email-match rule'),
    (5, 'claimed slots whose invite email differs from the claiming account''s email', (select count(*) from public.player_slots s join auth.users u on u.id = s.claimed_by
        where s.email is not null and lower(s.email) <> lower(u.email)), 'would NOT pass the planned email-match rule'),
    (6, 'claimed slots with no invite email', (select count(*) from public.player_slots where claimed_by is not null and email is null), 'claimed by code only'),
    (7, 'unclaimed slots with an invite email', (select count(*) from public.player_slots where claimed_by is null and email is not null), ''),
    (8, 'profiles whose player_slug and the slot''s claimed_by disagree', (select count(*) from public.profiles p left join public.player_slots s on s.player_slug = p.player_slug
        where p.player_slug is not null and s.claimed_by is distinct from p.id), 'should be 0'),
    (9, 'profiles whose email differs from their account email', (select count(*) from public.profiles p join auth.users u on u.id = p.id
        where lower(p.email) <> lower(coalesce(u.email, ''))), 'drift: username login uses profiles.email'),
    (10, 'profiles with an empty username or display name', (select count(*) from public.profiles where coalesce(trim(username), '') = '' or coalesce(trim(display_name), '') = ''), 'should be 0 today'),
    (11, 'accounts with more than one sign-in method', (select count(*) from (select user_id from auth.identities group by user_id having count(*) > 1) x), ''),
    (12, 'accounts with no sign-in method (identity) at all', (select count(*) from auth.users u where not exists (select 1 from auth.identities i where i.user_id = u.id)), 'e.g. invited, never accepted')
  ) as t(sort, label, value, note)
),
all_rows as (
  select section_order, section, kind, object, status, detail from account_rows
  union all select section_order, section, kind, object, status, detail from column_rows
  union all select section_order, section, kind, object, status, detail from constraint_rows
  union all select section_order, section, kind, object, status, detail from index_rows
  union all select section_order, section, kind, object, status, detail from trigger_rows
  union all select section_order, section, kind, object, status, detail from function_rows
  union all select section_order, section, kind, object, status, detail from count_rows
)
select row_number() over (order by section_order, case when section_order = 1 then object end, kind, object) as row_no, section, kind, object, status, detail
from (
  select 0 as section_order, '0. Read me first' as section, 'check' as kind,
    'total rows in this result (this row included)' as object,
    ((select count(*) from all_rows) + 1)::text as status,
    'If your export has fewer rows, or row_no skips a number, it was cut short.' as detail
  union all select * from all_rows
) everything
order by row_no;
