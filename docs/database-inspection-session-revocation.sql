-- docs/database-inspection-session-revocation.sql
-- READ-ONLY check for Pending accounts Phase 4/5: can this Supabase project's SQL role revoke sign-in sessions by
-- deleting rows from auth.sessions (what public.revoke_account_sessions() does)? Changes nothing: one READ ONLY
-- transaction, rolled back. No user data is printed (only roles, privileges and constraint names).
--
-- Owner runs it in the Supabase dashboard -> SQL editor (that editor runs as the role that would own the functions
-- created by supabase/account_activation.sql). Claude never runs SQL on a hosted project.
--
-- What the answers mean:
--   can_delete_sessions = true  -> revoke_account_sessions() works there as it does locally.
--   can_delete_sessions = false -> it returns -1 (no error, nothing deleted). Revocation then relies on the supported
--                                  Admin API sign-out of the caller's own token plus the eligibility checks
--                                  (account_is_active / PostgREST pre-request hook / MAROON_ACCOUNT_ENFORCEMENT gate),
--                                  which refuse an Ineligible account's tokens regardless of sessions.
--   refresh_tokens -> sessions delete rule = 'c' (cascade) -> deleting a session also kills its refresh tokens.

begin transaction read only;

select current_user as running_as, session_user;

select has_table_privilege(current_user, 'auth.sessions', 'DELETE') as can_delete_sessions,
       has_table_privilege(current_user, 'auth.sessions', 'SELECT') as can_read_sessions,
       has_table_privilege(current_user, 'auth.users', 'SELECT') as can_read_users;

select n.nspname || '.' || c.relname as table_name, pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and c.relname in ('sessions', 'refresh_tokens', 'users')
order by 1;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'auth' and table_name = 'sessions'
group by grantee order by grantee;

select conname, confrelid::regclass as references_table, confdeltype as delete_rule
from pg_constraint
where conrelid = 'auth.refresh_tokens'::regclass and contype = 'f';

select rolname, rolsuper, rolbypassrls
from pg_roles where rolname in (current_user, 'postgres', 'supabase_auth_admin', 'service_role', 'authenticated')
order by rolname;

rollback;
