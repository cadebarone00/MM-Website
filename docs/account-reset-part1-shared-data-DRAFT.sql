-- docs/account-reset-part1-shared-data-DRAFT.sql
-- DRAFT FOR APPROVAL. NOT APPROVED. DRY RUN ONLY: the last line is ROLLBACK. Not to be run on production.
--
-- Part 1 of the V2 reset (docs/account-reset-plan-2026-10-30.md): removes SHARED golf records, one approved group at a
-- time. It never touches a login, a profile or anyone's sign-in (it checks that at the end). Part 2 removes the accounts
-- and refuses to run while any shared record would still be deleted along with them.
--
-- Groups (each approved separately in step 0; the plan's decisions D2-D4 explain them):
--   S1 trips               every golf trip and everything under it, plus the score-override history (no foreign key)
--   S2 personal scoring    scoring groups with source 'personal' (stops if any 'tournament' ones exist), and player_rounds
--   S3 shared rounds       shared rounds with their players, holes and picks
--   S4 code tournaments    tournaments by code with their rounds, players, holes and cards
--   S5 customer tournaments platform tournaments that are not The Maroon, and organizations left with no tournament
--   S6 MM coin             bets, wager accounts and market settlements
--   S7 typed-in emails     clears (sets empty) the emails typed into kept Maroon player records (decision D7); the
--                          records themselves stay
--
-- Safety: one transaction; refuses to start until every group says 'delete' or 'keep' and every count matches the
-- approved inspection; prints counts only (no names, emails or ids); always undoes itself unless the last word is COMMIT.

begin;
-- Give up instead of queueing behind a busy table (a queued lock would also hold up the app); stop after 5 minutes.
set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- === 0. Approved scope and numbers (from the approved inspection, section S). Replace every NULL. ====================
create temp table reset_scope (grp text primary key, decision text check (decision in ('delete', 'keep'))) on commit drop;
insert into reset_scope values ('S1', null), ('S2', null), ('S3', null), ('S4', null), ('S5', null), ('S6', null), ('S7', null);

create temp table reset_expected (item text primary key, grp text, sql text, n bigint) on commit drop;
insert into reset_expected values
  ('accounts: auth.users', null, 'select count(*) from auth.users', null),
  ('accounts: profiles', null, 'select count(*) from public.profiles', null),
  ('S1 golf_trips', 'S1', 'select count(*) from public.golf_trips', null),
  ('S1 override history', 'S1', 'select (select count(*) from public.golf_trip_override_events) + (select count(*) from public.golf_trip_override_delegations)', null),
  ('S2 personal scoring_groups', 'S2', 'select count(*) from public.scoring_groups where source = ''personal''', null),
  ('S2 player_rounds', 'S2', 'select count(*) from public.player_rounds', null),
  ('S3 shared_rounds', 'S3', 'select count(*) from public.shared_rounds', null),
  ('S4 code_tournaments', 'S4', 'select count(*) from public.code_tournaments', null),
  ('S5 customer tournaments', 'S5', 'select count(*) from public.tournaments where not is_legacy', null),
  ('S6 mm_coin_bets', 'S6', 'select count(*) from public.mm_coin_bets', null),
  ('S6 wagers_accounts', 'S6', 'select count(*) from public.wagers_accounts', null),
  ('S6 wagers_market_settlements', 'S6', 'select count(*) from public.wagers_market_settlements', null),
  ('S7 player_slots emails', 'S7', 'select count(*) from public.player_slots where email is not null', null),
  ('S7 tournament_players emails', 'S7', 'select count(*) from public.tournament_players where email is not null', null);

do $$
declare r record; v bigint;
begin
  if exists (select 1 from reset_scope where decision is null) or exists (select 1 from reset_expected where n is null) then
    raise exception 'Step 0: fill in every decision and count first. Nothing was changed.';
  end if;
  for r in select * from reset_expected loop
    begin
      execute r.sql into v;
    exception when undefined_table or undefined_column then v := 0; -- not installed: approve 0
    end;
    if v <> r.n then
      raise exception 'Step 0: "%" is % but % was approved. Production changed since the inspection; nothing was changed.', r.item, v, r.n;
    end if;
  end loop;
end $$;

create temp table reset_counts (phase text, tbl text, n bigint) on commit drop;
do $$
declare t record; v bigint;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname = 'public' loop
    execute format('select count(*) from public.%I', t.relname) into v;
    insert into reset_counts values ('before', 'public.' || t.relname, v);
  end loop;
end $$;

-- Deletes one group's top tables (those that exist). Everything under them goes with them by cascade.
create or replace function pg_temp.reset_delete(p_grp text, p_statements text[]) returns void language plpgsql as $$
declare s text;
begin
  if (select decision from reset_scope where grp = p_grp) <> 'delete' then return; end if;
  foreach s in array p_statements loop
    begin
      execute s;
    exception when undefined_table or undefined_column then null;
    end;
  end loop;
end $$;

-- === S1 trips ==========================================================================================================
-- The override history refuses every delete and has no foreign key: unlocked for this run only, re-locked right after.
do $$
declare t text;
begin
  if (select decision from reset_scope where grp = 'S1') <> 'delete' then return; end if;
  foreach t in array array['golf_trip_override_events', 'golf_trip_override_delegations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I disable trigger override_immutable', t);
      execute format('delete from public.%I', t);
      execute format('alter table public.%I enable trigger override_immutable', t);
    end if;
  end loop;
end $$;
-- Members, invitations, rounds, scoring groups, hole scores, submitted cards and their history (removable only this
-- way, by design), corrections, flights, plans, games, momentum, push subscriptions, feed, chat, hand-offs.
select pg_temp.reset_delete('S1', array['delete from public.golf_trips']);

-- === S2 personal scoring ===============================================================================================
-- 2026-10-30 review: ONLY source = 'personal'. Scoring groups with source = 'tournament' may be Maroon Masters cards
-- (requirement: every independent Maroon record is kept), so their presence stops the run (check below) for a decision.
-- player_rounds are each golfer's personal COPY of a round (profile_id cascades); the trip / tournament cards and the
-- Maroon archive tables keep their own records.
do $$
declare v bigint := 0;
begin
  if to_regclass('public.scoring_groups') is not null then
    execute 'select count(*) from public.scoring_groups where source = ''tournament''' into v;
  end if;
  if v > 0 then
    raise exception 'S2: % tournament scoring group(s) exist. They may be Maroon records and block account deletion (created_by). Owner decision needed. Nothing was changed.', v;
  end if;
end $$;
select pg_temp.reset_delete('S2', array['delete from public.scoring_groups where source = ''personal''', 'delete from public.player_rounds']);

-- === S3 shared rounds ==================================================================================================
select pg_temp.reset_delete('S3', array['delete from public.shared_rounds']);

-- === S4 code tournaments ===============================================================================================
select pg_temp.reset_delete('S4', array['delete from public.code_tournaments']);

-- === S5 customer tournaments (The Maroon is kept) =====================================================================
select pg_temp.reset_delete('S5', array[
  'delete from public.tournaments where not is_legacy',
  'delete from public.organizations o where not exists (select 1 from public.tournaments t where t.organization_id = o.id)']);

-- === S6 MM coin ========================================================================================================
select pg_temp.reset_delete('S6', array['delete from public.mm_coin_bets', 'delete from public.wagers_accounts', 'delete from public.wagers_market_settlements']);

-- === S7 typed-in emails (rows kept, email emptied) ====================================================================
select pg_temp.reset_delete('S7', array[
  'update public.player_slots set email = null where email is not null',
  'update public.tournament_players set email = null where email is not null']);

do $$
begin
  if (select decision from reset_scope where grp = 'S7') = 'delete' and (
       (select count(*) from public.player_slots where email is not null) > 0
       or (to_regclass('public.tournament_players') is not null and (select count(*) from public.tournament_players where email is not null) > 0)) then
    raise exception 'S7: typed-in emails remain. Nothing was changed.';
  end if;
end $$;

-- === Checks: no account touched; the override history is locked again ================================================
do $$
begin
  if (select count(*) from auth.users) <> (select n from reset_expected where item = 'accounts: auth.users')
     or (select count(*) from public.profiles) <> (select n from reset_expected where item = 'accounts: profiles') then
    raise exception 'Part 1 changed an account. Nothing was changed.';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'override_immutable' and tgenabled = 'D') then
    raise exception 'Override history was not re-locked. Nothing was changed.';
  end if;
end $$;

-- === Audit output: every table whose row count changed (save with the run record) =====================================
do $$
declare t record; v bigint;
begin
  for t in select tbl from reset_counts where phase = 'before' loop
    execute format('select count(*) from %s', t.tbl) into v;
    insert into reset_counts values ('after', t.tbl, v);
  end loop;
end $$;

select b.tbl as table_name, b.n as rows_before, a.n as rows_after, b.n - a.n as rows_removed,
  (select string_agg(grp || '=' || decision, ' ' order by grp) from reset_scope) as scope, now() as run_at
from reset_counts b join reset_counts a on a.tbl = b.tbl and a.phase = 'after'
where b.phase = 'before' and a.n <> b.n
order by b.tbl;

-- DRY RUN: undo everything above. Only an approved production run may replace this one word with COMMIT.
rollback;
