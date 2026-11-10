-- docs/database-inspection-session-revocation.sql
-- READ-ONLY check for Pending accounts Phase 4/5: can this Supabase project's SQL role revoke sign-in sessions by
-- deleting rows from auth.sessions (what public.revoke_account_sessions() does)? Changes nothing: the first line switches
-- this run to READ ONLY, so the database itself refuses any write. No user data is printed (only roles, privileges and
-- constraint names).
--
-- Owner runs it in the Supabase dashboard -> SQL editor -> paste the WHOLE file -> Run once -> ONE results table (that
-- editor runs as the role that would own the functions created by supabase/account_activation.sql). Export it as CSV.
-- If Supabase answers with an error about SET TRANSACTION, delete that first line and run again: the rest is one select.
-- Claude never runs SQL on a hosted project.
--
-- Combined 2026-10-30 (was six separate selects; the SQL editor shows only the last result). Same checks as before.
-- Every table is looked up with to_regclass(), so a missing one shows "not found" instead of failing the run.
--
-- What the answers mean:
--   can_delete_sessions = true  -> revoke_account_sessions() works there as it does locally.
--   can_delete_sessions = false -> it returns -1 (no error, nothing deleted). Revocation then relies on the supported
--                                  Admin API sign-out of the caller's own token plus the eligibility checks
--                                  (account_is_active / PostgREST pre-request hook / MAROON_ACCOUNT_ENFORCEMENT gate),
--                                  which refuse an Ineligible account's tokens regardless of sessions.
--   refresh_tokens -> sessions delete rule = 'c' (cascade) -> deleting a session also kills its refresh tokens.

set transaction read only;

-- One query, one result: (row_no, section, item, value). Row 1 says how many rows there should be.
with checks(sort_section, sort_item, section, item, value) as (
  -- A. Who the SQL editor runs as
  select 1, '1', 'A. role', 'running_as (current_user)', current_user::text
  union all select 1, '2', 'A. role', 'session_user', session_user::text
  -- B. Privileges of that role (NULL table = "not found")
  union all select 2, '1', 'B. privileges', 'can_delete_sessions (auth.sessions DELETE)',
    coalesce(has_table_privilege(current_user, to_regclass('auth.sessions'), 'DELETE')::text, 'auth.sessions not found')
  union all select 2, '2', 'B. privileges', 'can_read_sessions (auth.sessions SELECT)',
    coalesce(has_table_privilege(current_user, to_regclass('auth.sessions'), 'SELECT')::text, 'auth.sessions not found')
  union all select 2, '3', 'B. privileges', 'can_read_users (auth.users SELECT)',
    coalesce(has_table_privilege(current_user, to_regclass('auth.users'), 'SELECT')::text, 'auth.users not found')
  -- C. Owners of the Auth tables
  union all select 3, t.name, 'C. table owner', t.name,
    coalesce((select pg_get_userbyid(c.relowner)::text from pg_class c where c.oid = to_regclass(t.name)), 'not found')
  from unnest(array['auth.refresh_tokens', 'auth.sessions', 'auth.users']) as t(name)
  -- D. Who has which privileges on auth.sessions
  union all select 4, g.grantee, 'D. auth.sessions grants', 'grantee ' || g.grantee,
    string_agg(g.privilege_type, ', ' order by g.privilege_type)
  from information_schema.role_table_grants g
  where g.table_schema = 'auth' and g.table_name = 'sessions'
  group by g.grantee
  -- E. refresh_tokens foreign keys and their delete rule ('c' = cascade)
  union all select 5, con.conname, 'E. refresh_tokens foreign keys', con.conname,
    'references ' || con.confrelid::regclass::text || '; delete_rule = ' || con.confdeltype::text
  from pg_constraint con
  where con.conrelid = to_regclass('auth.refresh_tokens') and con.contype = 'f'
  union all select 5, '~', 'E. refresh_tokens foreign keys', 'auth.refresh_tokens',
    case when to_regclass('auth.refresh_tokens') is null then 'not found' else 'table found' end
  -- F. Relevant roles
  union all select 6, r.rolname, 'F. roles', r.rolname,
    'rolsuper = ' || r.rolsuper::text || '; rolbypassrls = ' || r.rolbypassrls::text
  from pg_roles r
  where r.rolname in (current_user, 'postgres', 'supabase_auth_admin', 'service_role', 'authenticated')
  -- G. Optional V2 object (account_activation.sql): informational only, never called
  union all select 7, '1', 'G. optional V2 object', 'public.revoke_account_sessions()',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'revoke_account_sessions')
         then 'installed' else 'not installed' end
), numbered as (
  select row_number() over (order by sort_section, sort_item) + 1 as row_no, section, item, value from checks
)
select 1::bigint as row_no, '0. Read me first' as section, 'rows in this result' as item,
  ((select count(*) from numbered) + 1)::text as value
union all
select row_no, section, item, value from numbered
order by row_no;
