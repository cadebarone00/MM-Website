-- docs/account-reset-part2-accounts-DRAFT.sql
-- DRAFT FOR APPROVAL. NOT APPROVED. DRY RUN ONLY: the last line is ROLLBACK. Not to be run on production.
--
-- Part 2 of the V2 reset (docs/account-reset-plan-2026-10-30.md): removes every legacy LOGIN and the records that
-- belong only to an account. It deletes NO shared golf record: if removing the accounts would also remove a row from
-- any table outside the account-only list below (a trip, a scorecard, a round, a bet...), it stops and names the table.
-- Those are approved separately in Part 1. Shared records that only point at an account (The Maroon archive, course
-- library, settings) are kept with the link emptied.
--
-- Removed with each login, by Supabase: sign-in identities (email / Google / Apple), sessions, refresh tokens, MFA
-- factors, one-time codes. Removed here: profiles and the account-only tables listed in step 3.
--
-- Safety: one transaction; refuses to start until the approved numbers are typed in and still match; scans every uuid
-- column in public and auth for a removed id afterwards; prints counts only; always undoes itself unless the last word
-- is COMMIT. Works with and without account_deletion.sql (tombstones) installed. Storage files are removed afterwards
-- through the dashboard (SQL can't), plan step R7.

begin;
-- Give up instead of queueing behind Supabase Auth (a queued lock on logins would hold up every sign-in); stop after
-- 5 minutes.
set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- === 0. Approved numbers and options (replace every NULL) ===========================================================
create temp table reset_expected (item text primary key, n bigint) on commit drop;
insert into reset_expected values
  ('auth.users', null),            -- inspection section A "auth.users: total login accounts"
  ('public.profiles', null);       -- inspection section B "profiles: total"
create temp table reset_options (opt text primary key, value text check (value in ('yes', 'no'))) on commit drop;
insert into reset_options values
  ('D6 clear Supabase sign-in log (auth.audit_log_entries)', null);   -- D6 is ON HOLD (owner, 2026-10-30): only 'no' is accepted

do $$
begin
  if (select value from reset_options where opt like 'D6%') = 'yes' then
    raise exception 'D6 (clearing the Supabase sign-in log) is on hold until retention requirements and a supported method are confirmed. Nothing was changed.';
  end if;
end $$;

do $$
declare r record; v bigint;
begin
  if exists (select 1 from reset_expected where n is null) or exists (select 1 from reset_options where value is null) then
    raise exception 'Step 0: fill in the approved counts and options first. Nothing was changed.';
  end if;
  for r in select * from reset_expected loop
    execute format('select count(*) from %s', r.item) into v;
    if v <> r.n then
      raise exception 'Step 0: % has % rows but % were approved. Production changed since the inspection; nothing was changed.', r.item, v, r.n;
    end if;
  end loop;
end $$;

-- Nobody can add or change a login or profile while this runs (reads still work). Takes seconds.
lock table auth.users in exclusive mode;
lock table public.profiles in exclusive mode;

-- Flags read by the tombstone guards if account_deletion.sql is installed (no effect otherwise). Local to this run.
set local maroon.allow_profile_delete = 'on';
set local maroon.account_deletion = 'on';
set local maroon.claim_unlock = 'on';

-- === 1. Snapshot: ids being removed, every table's row count ===========================================================
create temp table reset_ids on commit drop as select id from auth.users union select id from public.profiles;
create temp table reset_counts (phase text, tbl text, n bigint) on commit drop;
do $$
declare t record; v bigint;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'auth') loop
    execute format('select count(*) from %I.%I', t.nspname, t.relname) into v;
    insert into reset_counts values ('before', t.nspname || '.' || t.relname, v);
  end loop;
end $$;

-- === 2. Kept legacy player records: claims released, no lock ==========================================================
do $$
begin
  if to_regclass('public.player_slots') is not null then
    update public.player_slots set claimed_by = null, claimed_at = null where claimed_by is not null or claimed_at is not null;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_slots' and column_name = 'claim_locked_at') then
      execute 'update public.player_slots set claim_locked_at = null, claim_locked_reason = null where claim_locked_at is not null';
    end if;
  end if;
end $$;

-- === 3. Account-only records, profiles, logins ========================================================================
do $$
declare t text;
begin
  foreach t in array array['account_deletion_events', 'account_deletions', 'auth_code_attempts'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I', t); end if;
  end loop;
  -- Half-finished Google / Apple sign-ins: Supabase keeps the account id here without a foreign key.
  if to_regclass('auth.flow_state') is not null then
    execute 'delete from auth.flow_state where user_id in (select id from reset_ids)';
  end if;
  if (select value from reset_options where opt like 'D6%') = 'yes' and to_regclass('auth.audit_log_entries') is not null then
    delete from auth.audit_log_entries;
  end if;
end $$;
-- A shared record with no delete rule (a submitted scorecard, a scoring group, a settled market...) blocks this outright.
do $$
declare v_table text;
begin
  delete from public.profiles;
  delete from auth.users;
exception when foreign_key_violation or restrict_violation then
  get stacked diagnostics v_table = table_name;
  raise exception 'Step 3: shared records in public.% still point at accounts and block the delete. Approve and run Part 1 for them first. Nothing was changed.', v_table;
end $$;

-- === 4. Nothing shared may have been removed ===========================================================================
-- Tables allowed to lose rows here: Supabase's auth tables, and records that exist only for an account.
do $$
declare t record; v bigint; bad text := '';
begin
  for t in select tbl, n from reset_counts where phase = 'before' loop
    execute format('select count(*) from %s', t.tbl) into v;
    insert into reset_counts values ('after', t.tbl, v);
    if v < t.n and t.tbl not like 'auth.%' and t.tbl not in (
        -- 2026-10-30 review: the friends table is profile_friend_requests (there is no profile_friends); also account-only:
        -- account_security_events (sign-in alerts) and historical_link_requests (a person's own claim requests).
        'public.profiles', 'public.profile_friend_requests', 'public.account_security_events', 'public.historical_link_requests',
        'public.tournament_creator_access', 'public.tournament_access_requests',
        'public.tournament_members', 'public.player_claim_invitations', 'public.account_deletions', 'public.account_deletion_events',
        'public.auth_code_attempts', 'public.account_birthdates', 'public.account_eligibility', 'public.terms_acceptances',
        'public.pending_invitations', 'public.birthdate_corrections') then
      bad := bad || ' ' || t.tbl || ' (' || (t.n - v) || ' rows)';
    end if;
  end loop;
  if bad <> '' then
    raise exception 'Step 4: removing the accounts would also delete shared records:%. Approve and run Part 1 for them first. Nothing was changed.', bad;
  end if;
end $$;

-- === 5. Zero accounts, zero sessions, no removed id left anywhere ====================================================
do $$
declare t record; v bigint;
begin
  if (select count(*) from auth.users) <> 0 or (select count(*) from public.profiles) <> 0 then
    raise exception 'Step 5: accounts remain. Nothing was changed.';
  end if;
  if (select count(*) from auth.identities) <> 0 or (select count(*) from auth.sessions) <> 0 then
    raise exception 'Step 5: sign-in identities or sessions remain. Nothing was changed.';
  end if;
  for t in select c.table_schema, c.table_name, c.column_name from information_schema.columns c
      join pg_namespace n on n.nspname = c.table_schema join pg_class k on k.relnamespace = n.oid and k.relname = c.table_name
    where c.table_schema in ('public', 'auth') and c.data_type = 'uuid' and k.relkind = 'r'
      and (c.table_name::text, c.column_name::text) not in (
        -- Approved exceptions (decision D5): append-only Highlights configuration history keeps who published it.
        ('highlight_config_versions', 'published_by'), ('highlight_config_active', 'activated_by'),
        ('highlight_config_drafts', 'created_by'), ('highlight_config_drafts', 'resolved_by'),
        ('highlight_config_audit', 'actor_profile_id')) loop
    execute format('select count(*) from %I.%I where %I in (select id from reset_ids)', t.table_schema, t.table_name, t.column_name) into v;
    if v > 0 then
      raise exception 'Step 5: %.%.% still holds % removed account id(s). Nothing was changed.', t.table_schema, t.table_name, t.column_name, v;
    end if;
  end loop;
end $$;

-- === 6. Audit output (save with the run record) ======================================================================
select b.tbl as table_name, b.n as rows_before, a.n as rows_after, b.n - a.n as rows_removed,
  (select count(*) from reset_ids) as accounts_removed, now() as run_at
from reset_counts b join reset_counts a on a.tbl = b.tbl and a.phase = 'after'
where b.phase = 'before' and a.n <> b.n
order by b.tbl;

-- DRY RUN: undo everything above. Only an approved production run may replace this one word with COMMIT.
rollback;
