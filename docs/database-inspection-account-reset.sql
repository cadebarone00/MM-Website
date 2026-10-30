-- docs/database-inspection-account-reset.sql
-- READ-ONLY inspection for the V2 legacy account reset (docs/account-reset-plan-2026-10-30.md).
--
-- What it does: the first line switches this run to READ ONLY (the database refuses any write). After that comes ONE
-- select that reads the database's own catalog (foreign keys, triggers, policies, buckets) plus COUNTS. It never selects
-- emails, names, phone numbers, password hashes, tokens, ids or any other column of any person's row.
--
-- How to run: Supabase dashboard -> check the top-left says the PRODUCTION project -> SQL Editor -> New query -> paste
-- this whole file -> Run. Then use the results panel's export / download (CSV) and send the file back.
-- Completeness check: row 1 says how many rows the result has, and every row has a row_no without gaps.
-- If Supabase answers with an error about SET TRANSACTION, delete the "set transaction read only;" line and run again.
-- Claude never runs SQL on a hosted project.
--
-- Side effects (reviewed 2026-10-30): none. Every statement reads; the transaction refuses writes; no app function is
-- called and no trigger can fire (triggers only fire on writes). Counting takes the lightest table lock (ACCESS SHARE),
-- which never blocks normal reads or writes; lock_timeout makes it give up after 5 seconds instead of waiting behind a
-- running migration, and statement_timeout stops the whole check after 2 minutes. It never prints names, emails, ids or
-- tokens: only table / column / trigger / bucket names and numbers.
--
-- Sections:
--   A  Login accounts (auth.users and Supabase's own login tables)
--   B  Profiles and legacy player claims
--   C  Which account-safety SQL files are installed (decides which deletion order works)
--   D  Owners and admins (who runs trips, tournaments, admin tools)
--   S  Deletion groups (S1 trips ... S6 MM coin): how many top-level rows each group would remove
--   E  Per deletion group (ACCOUNTS, S1 ... S6): every table linked to it by foreign key, its delete rule, its rows and
--      how many rows are linked. Each group empties its top table, so "linked" on a CASCADE line is exactly the number
--      of rows removed with it (S5 is the exception: it keeps The Maroon, so its numbers are an upper bound).
--   F  Account-like columns WITHOUT a foreign key, in public AND Supabase's auth tables (would be left dangling)
--   G  Triggers on every table the reset touches (any event), on logins and Storage, and any database webhook
--   H  Storage buckets and file counts
--   I  Tables with NO link to accounts (stay untouched by the reset)
--   X  Anything that could act outside the database while a reset script runs (internet calls, webhooks, jobs, Realtime)

set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

with recursive
cols as (
  select table_schema, table_name, column_name, data_type from information_schema.columns
  where table_schema in ('auth', 'public', 'storage')
),
-- Simple counts: each item is a counting query that only runs when the objects it needs exist.
items(section, sort, item, ready, sql, note) as (values
  ('A', 1, 'auth.users: total login accounts', true, $q$select count(*) as c from auth.users$q$, 'Every one of these is a legacy account to remove'),
  ('A', 2, 'auth.users: email confirmed', true, $q$select count(*) as c from auth.users where email_confirmed_at is not null$q$, null),
  ('A', 3, 'auth.users: never signed in', true, $q$select count(*) as c from auth.users where last_sign_in_at is null$q$, null),
  ('A', 4, 'auth.users: signed in during the last 7 days', true, $q$select count(*) as c from auth.users where last_sign_in_at > now() - interval '7 days'$q$, 'Active people who will notice the reset'),
  ('A', 5, 'auth.users: signed in during the last 30 days', true, $q$select count(*) as c from auth.users where last_sign_in_at > now() - interval '30 days'$q$, null),
  ('A', 6, 'auth.users: banned right now', true, $q$select count(*) as c from auth.users where banned_until > now()$q$, null),
  ('A', 7, 'auth.users: anonymous accounts', exists (select 1 from cols where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous'),
    $q$select count(*) as c from auth.users where is_anonymous$q$, null),
  ('A', 8, 'auth.users: SSO accounts', exists (select 1 from cols where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user'),
    $q$select count(*) as c from auth.users where is_sso_user$q$, null),
  ('A', 9, 'auth.users: soft-deleted (deleted_at set)', exists (select 1 from cols where table_schema = 'auth' and table_name = 'users' and column_name = 'deleted_at'),
    $q$select count(*) as c from auth.users where deleted_at is not null$q$, null),
  ('A', 10, 'auth.users: created during the last 7 days', true, $q$select count(*) as c from auth.users where created_at > now() - interval '7 days'$q$, 'Sign-ups still arriving'),
  ('A', 11, 'auth.sessions: total', to_regclass('auth.sessions') is not null, $q$select count(*) as c from auth.sessions$q$, 'Signed-in devices'),
  ('A', 12, 'auth.refresh_tokens: not revoked', to_regclass('auth.refresh_tokens') is not null, $q$select count(*) as c from auth.refresh_tokens where not revoked$q$, null),
  ('A', 13, 'auth.mfa_factors: total', to_regclass('auth.mfa_factors') is not null, $q$select count(*) as c from auth.mfa_factors$q$, null),
  ('A', 14, 'auth.one_time_tokens: total', to_regclass('auth.one_time_tokens') is not null, $q$select count(*) as c from auth.one_time_tokens$q$, 'Pending email links / codes'),
  ('A', 15, 'auth.audit_log_entries: total', to_regclass('auth.audit_log_entries') is not null, $q$select count(*) as c from auth.audit_log_entries$q$,
    'Supabase sign-in log (holds emails / IP addresses); not removed by deleting logins'),
  ('A', 16, 'auth.flow_state: total', to_regclass('auth.flow_state') is not null, $q$select count(*) as c from auth.flow_state$q$, 'Half-finished Google / Apple sign-ins'),

  ('B', 1, 'profiles: total', to_regclass('public.profiles') is not null, $q$select count(*) as c from public.profiles$q$, null),
  ('B', 2, 'profiles: no login behind them', to_regclass('public.profiles') is not null,
    $q$select count(*) as c from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)$q$, 'Orphans or tombstones'),
  ('B', 3, 'auth.users: no profile', to_regclass('public.profiles') is not null,
    $q$select count(*) as c from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)$q$, 'Half-finished sign-ups'),
  ('B', 4, 'profiles: deleted_at set (tombstones)', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at'),
    $q$select count(*) as c from public.profiles where deleted_at is not null$q$, null),
  ('B', 5, 'profiles: activated_at set (V2 Active)', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'activated_at'),
    $q$select count(*) as c from public.profiles where activated_at is not null$q$, 'Any V2 accounts already in production'),
  ('B', 6, 'profiles: profile photo set', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'),
    $q$select count(*) as c from public.profiles where avatar_path is not null$q$, null),
  ('B', 7, 'profiles: linked to a legacy player (player_slug)', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'player_slug'),
    $q$select count(*) as c from public.profiles where player_slug is not null$q$, null),
  ('B', 8, 'player_slots: total legacy player records', to_regclass('public.player_slots') is not null, $q$select count(*) as c from public.player_slots$q$, null),
  ('B', 9, 'player_slots: claimed by an account', to_regclass('public.player_slots') is not null, $q$select count(*) as c from public.player_slots where claimed_by is not null$q$, null),
  ('B', 10, 'player_slots: claim locked', exists (select 1 from cols where table_schema = 'public' and table_name = 'player_slots' and column_name = 'claim_locked_at'),
    $q$select count(*) as c from public.player_slots where claim_locked_at is not null$q$, null),

  ('C', 0, 'running as (must see every row)', true,
    $q$select current_user || case when rolsuper or rolbypassrls then ' (sees every row)' else ' (ROW SECURITY APPLIES: counts may be too low; stop and tell Claude)' end as c from pg_roles where rolname = current_user$q$, null),
  ('C', 1, 'profiles.id -> auth.users foreign key present', true,
    $q$select count(*) as c from pg_constraint where contype = 'f' and conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass$q$,
    '1 = old design (deleting a login cascades into profiles). 0 = account_deletion.sql detached it'),
  ('C', 2, 'account_deletions ledger rows', to_regclass('public.account_deletions') is not null, $q$select count(*) as c from public.account_deletions$q$,
    'not installed = account_deletion.sql never ran'),
  ('C', 3, 'guard_profile_rows trigger (refuses profile deletes)', true,
    $q$select count(*) as c from pg_trigger where tgname = 'guard_profile_rows' and not tgisinternal$q$, '1 = profile deletes need maroon.allow_profile_delete'),
  ('C', 4, 'active_account_only restrictive policies', true, $q$select count(*) as c from pg_policies where policyname = 'active_account_only'$q$, null),
  ('C', 5, 'authenticator has a PostgREST pre-request hook', true,
    $q$select count(*) as c from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator' and array_to_string(s.setconfig, ',') like '%db_pre_request%'$q$, null),
  ('C', 6, 'account_activation.sql installed (account_eligibility rows)', to_regclass('public.account_eligibility') is not null,
    $q$select count(*) as c from public.account_eligibility$q$, 'not installed = V2 activation SQL never ran'),
  ('C', 7, 'profile_initialization.sql installed (player_claim_invitations rows)', to_regclass('public.player_claim_invitations') is not null,
    $q$select count(*) as c from public.player_claim_invitations$q$, null),
  ('C', 8, 'Storage refuses direct SQL deletes (protect_delete trigger)', true,
    $q$select count(*) as c from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and t.tgname ilike '%protect%delete%'$q$,
    '1+ = files must be removed through the Storage dashboard / API, not SQL'),
  ('C', 9, 'SQL editor role may delete logins (auth.users DELETE privilege)', true,
    $q$select case when has_table_privilege(current_user, 'auth.users', 'DELETE') then 1 else 0 end as c$q$, '0 = the reset must delete logins through the Auth Admin API instead'),
  ('C', 10, 'score-override history rows (append-only, no foreign key)', to_regclass('public.golf_trip_override_events') is not null,
    $q$select (select count(*) from public.golf_trip_override_events) + (select count(*) from public.golf_trip_override_delegations) as c$q$, null),
  ('C', 11, 'Highlights configuration history rows (append-only, kept)', to_regclass('public.highlight_config_versions') is not null,
    $q$select count(*) as c from public.highlight_config_versions$q$, 'Kept: system configuration'),

  ('D', 1, 'profiles: is_host (Maroon Admin Center access)', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_host'),
    $q$select count(*) as c from public.profiles where is_host$q$, 'Admins to re-grant after they sign up again'),
  ('D', 2, 'profiles: platform_role = admin', exists (select 1 from cols where table_schema = 'public' and table_name = 'profiles' and column_name = 'platform_role'),
    $q$select count(*) as c from public.profiles where platform_role = 'admin'$q$, null),
  ('D', 3, 'tournament_creator_access rows', to_regclass('public.tournament_creator_access') is not null, $q$select count(*) as c from public.tournament_creator_access$q$, null),
  ('D', 4, 'golf_trips: total', to_regclass('public.golf_trips') is not null, $q$select count(*) as c from public.golf_trips$q$, null),
  ('D', 5, 'golf_trips: distinct organizers', to_regclass('public.golf_trips') is not null, $q$select count(distinct created_by) as c from public.golf_trips$q$, null),
  ('D', 6, 'golf_trip_members: with an account', to_regclass('public.golf_trip_members') is not null, $q$select count(*) as c from public.golf_trip_members where profile_id is not null$q$, null),
  ('D', 7, 'golf_trip_members: no account (typed-in travelers)', to_regclass('public.golf_trip_members') is not null, $q$select count(*) as c from public.golf_trip_members where profile_id is null$q$,
    'Rows with typed names / emails / phones and no account'),
  ('D', 8, 'code_tournaments: total', to_regclass('public.code_tournaments') is not null, $q$select count(*) as c from public.code_tournaments$q$, null),
  ('D', 9, 'code_tournaments: distinct organizers', to_regclass('public.code_tournaments') is not null, $q$select count(distinct organizer) as c from public.code_tournaments$q$, null),
  ('D', 10, 'shared_rounds: total', to_regclass('public.shared_rounds') is not null, $q$select count(*) as c from public.shared_rounds$q$, null),
  ('D', 11, 'tournaments (platform): total', to_regclass('public.tournaments') is not null, $q$select count(*) as c from public.tournaments$q$, null),
  ('D', 12, 'tournaments (platform): is_legacy (The Maroon)', exists (select 1 from cols where table_schema = 'public' and table_name = 'tournaments' and column_name = 'is_legacy'),
    $q$select count(*) as c from public.tournaments where is_legacy$q$, null),
  ('D', 13, 'organizations: total', to_regclass('public.organizations') is not null, $q$select count(*) as c from public.organizations$q$, null),
  ('D', 14, 'website_section_settings: last edited by an account', exists (select 1 from cols where table_schema = 'public' and table_name = 'website_section_settings' and column_name = 'updated_by'),
    $q$select count(*) as c from public.website_section_settings where updated_by is not null$q$, null),
  ('D', 15, 'tournament_members: owner or organizer role', to_regclass('public.tournament_members') is not null,
    $q$select count(*) as c from public.tournament_members where role in ('owner', 'organizer')$q$, null),
  ('D', 16, 'The Maroon: owner / organizer memberships', to_regclass('public.tournament_members') is not null and exists (select 1 from cols where table_name = 'tournaments' and column_name = 'is_legacy'),
    $q$select count(*) as c from public.tournament_members m join public.tournaments t on t.id = m.tournament_id where t.is_legacy and m.role in ('owner', 'organizer')$q$,
    'Removed with the accounts: restored by the admin re-grant'),
  ('S', 1, 'S1 trips: golf_trips', to_regclass('public.golf_trips') is not null, $q$select count(*) as c from public.golf_trips$q$, null),
  ('S', 2, 'S1 trips: score-override history rows (no foreign key)', to_regclass('public.golf_trip_override_events') is not null,
    $q$select (select count(*) from public.golf_trip_override_events) + (select count(*) from public.golf_trip_override_delegations) as c$q$, null),
  ('S', 3, 'S1 trips: browser push subscriptions', to_regclass('public.trip_push_subscriptions') is not null, $q$select count(*) as c from public.trip_push_subscriptions$q$, null),
  ('S', 4, 'S2 personal scoring: scoring_groups not tied to a trip', exists (select 1 from cols where table_name = 'scoring_groups' and column_name = 'source'),
    $q$select count(*) as c from public.scoring_groups where source <> 'trip'$q$, null),
  ('S', 5, 'S2 personal scoring: player_rounds', to_regclass('public.player_rounds') is not null, $q$select count(*) as c from public.player_rounds$q$, null),
  ('S', 6, 'S3 shared rounds: shared_rounds', to_regclass('public.shared_rounds') is not null, $q$select count(*) as c from public.shared_rounds$q$, null),
  ('S', 7, 'S4 code tournaments: code_tournaments', to_regclass('public.code_tournaments') is not null, $q$select count(*) as c from public.code_tournaments$q$, null),
  ('S', 8, 'S5 customer tournaments: tournaments that are not The Maroon', exists (select 1 from cols where table_name = 'tournaments' and column_name = 'is_legacy'),
    $q$select count(*) as c from public.tournaments where not is_legacy$q$, null),
  ('S', 9, 'S5 customer tournaments: their editions', exists (select 1 from cols where table_name = 'tournaments' and column_name = 'is_legacy') and to_regclass('public.tournament_editions') is not null,
    $q$select count(*) as c from public.tournament_editions e join public.tournaments t on t.id = e.tournament_id where not t.is_legacy$q$, null),
  ('S', 10, 'S5 customer tournaments: their players', exists (select 1 from cols where table_name = 'tournaments' and column_name = 'is_legacy') and to_regclass('public.tournament_players') is not null,
    $q$select count(*) as c from public.tournament_players p join public.tournaments t on t.id = p.tournament_id where not t.is_legacy$q$, null),
  ('S', 11, 'S5 customer tournaments: organizations with no Maroon tournament', exists (select 1 from cols where table_name = 'tournaments' and column_name = 'is_legacy'),
    $q$select count(*) as c from public.organizations o where not exists (select 1 from public.tournaments t where t.organization_id = o.id and t.is_legacy)$q$, null),
  ('S', 12, 'S6 MM coin: mm_coin_bets', to_regclass('public.mm_coin_bets') is not null, $q$select count(*) as c from public.mm_coin_bets$q$, null),
  ('S', 13, 'S6 MM coin: wagers_accounts', to_regclass('public.wagers_accounts') is not null, $q$select count(*) as c from public.wagers_accounts$q$, null),
  ('S', 14, 'S6 MM coin: wagers_market_settlements', to_regclass('public.wagers_market_settlements') is not null, $q$select count(*) as c from public.wagers_market_settlements$q$, null),
  ('S', 15, 'S7 typed-in emails: player_slots', exists (select 1 from cols where table_name = 'player_slots' and column_name = 'email'),
    $q$select count(*) as c from public.player_slots where email is not null$q$, 'Rows kept; only the email would be emptied'),
  ('S', 16, 'S7 typed-in emails: tournament_players', exists (select 1 from cols where table_name = 'tournament_players' and column_name = 'email'),
    $q$select count(*) as c from public.tournament_players where email is not null$q$, 'Rows kept; only the email would be emptied')
),
counted as (
  select section, sort, item,
    case when not ready then 'not installed'
         else (xpath('/row/c/text()', query_to_xml(sql, false, true, '')))[1]::text end as value,
    note
  from items
),
-- Role breakdowns (role names only, never people).
roles as (
  select 'A' as section, 100 + row_number() over (order by provider) as sort, 'auth.identities: provider ' || provider as item, count(*)::text as value, 'Sign-in methods in use' as note
  from auth.identities group by provider
),
-- Foreign-key graph, one per deletion group: every link into a table the group empties, then whatever cascades from it.
-- Links into rows that are only SET NULL (kept) are not followed further: those rows stay.
edges as (
  select cn.nspname as child_schema, c.relname as child_table, a.attname as child_column,
    pn.nspname as parent_schema, p.relname as parent_table, con.confdeltype as del
  from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace cn on cn.oid = c.relnamespace
    join pg_class p on p.oid = con.confrelid join pg_namespace pn on pn.oid = p.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
  where con.contype = 'f'
),
roots(grp, root_schema, root_table) as (values
  ('ACCOUNTS', 'auth', 'users'), ('ACCOUNTS', 'public', 'profiles'),
  ('S1 trips', 'public', 'golf_trips'),
  ('S2 personal scoring', 'public', 'scoring_groups'), ('S2 personal scoring', 'public', 'player_rounds'),
  ('S3 shared rounds', 'public', 'shared_rounds'),
  ('S4 code tournaments', 'public', 'code_tournaments'),
  ('S5 customer tournaments', 'public', 'tournaments'), ('S5 customer tournaments', 'public', 'organizations'),
  ('S6 MM coin', 'public', 'mm_coin_bets'), ('S6 MM coin', 'public', 'wagers_accounts'), ('S6 MM coin', 'public', 'wagers_market_settlements')
),
graph(grp, depth, child_schema, child_table, child_column, parent_schema, parent_table, del, all_cascade, path) as (
  select r.grp, 1, e.child_schema, e.child_table, e.child_column, e.parent_schema, e.parent_table, e.del, e.del = 'c',
    array[r.root_schema || '.' || r.root_table, e.child_schema || '.' || e.child_table]
  from roots r join edges e on e.parent_schema = r.root_schema and e.parent_table = r.root_table
  where not (e.child_schema = r.root_schema and e.child_table = r.root_table)
  union all
  select g.grp, g.depth + 1, e.child_schema, e.child_table, e.child_column, e.parent_schema, e.parent_table, e.del, g.all_cascade and e.del = 'c',
    g.path || (e.child_schema || '.' || e.child_table)
  from graph g join edges e on e.parent_schema = g.child_schema and e.parent_table = g.child_table
  where g.all_cascade and g.depth < 8 and not (e.child_schema || '.' || e.child_table) = any(g.path)
),
graph_edges as (
  select grp, child_schema, child_table, child_column, parent_schema, parent_table, del, min(depth) as depth, bool_or(all_cascade) as all_cascade
  from graph group by 1, 2, 3, 4, 5, 6, 7
),
graph_rows as (
  select 'E' as section, dense_rank() over (order by grp) * 100000 + depth * 1000 + row_number() over (partition by grp, depth order by child_schema, child_table, child_column) as sort,
    grp || ' | depth ' || depth || ': ' || child_schema || '.' || child_table || '.' || child_column || ' -> ' || parent_schema || '.' || parent_table as item,
    'on delete ' || case del when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'r' then 'RESTRICT' when 'a' then 'NO ACTION (blocks)' when 'd' then 'SET DEFAULT' else del::text end
      || '; rows ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', child_schema, child_table), false, true, '')))[1]::text
      || '; linked ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I where %I is not null', child_schema, child_table, child_column), false, true, '')))[1]::text as value,
    case when all_cascade then 'rows removed automatically when the login is deleted' when del in ('a', 'r') then 'BLOCKS the delete while linked rows exist: clear these first'
      when del = 'n' then 'row kept, link emptied' end as note
  from graph_edges
),
-- Account-like uuid columns with no foreign key: a delete leaves these pointing at nothing.
loose as (
  select col.table_schema, col.table_name, col.column_name
  from cols col
  where col.table_schema in ('public', 'auth') and col.data_type = 'uuid' and col.column_name <> 'id'
    and (col.column_name ~ '(profile|user|account|actor|owner|host|organizer|attester|player_id|invitee|inviter)' or col.column_name ~ '_by$')
    and not exists (
      select 1 from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
      where con.contype = 'f' and con.conrelid = format('%I.%I', col.table_schema, col.table_name)::regclass and a.attname = col.column_name)
    and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = col.table_schema and c.relname = col.table_name and c.relkind = 'r')
),
loose_rows as (
  select 'F' as section, row_number() over (order by table_name, column_name) as sort, table_schema || '.' || table_name || '.' || column_name as item,
    'non-empty ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I where %I is not null', table_schema, table_name, column_name), false, true, '')))[1]::text
      || '; matching a login ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I x where x.%I in (select id from auth.users)', table_schema, table_name, column_name), false, true, '')))[1]::text as value,
    'No foreign key: must be cleared explicitly' as note
  from loose
  union all
  select 'F', 500 + row_number() over (order by table_name, column_name), table_schema || '.' || table_name || '.' || column_name,
    'non-empty ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I where %I is not null', table_schema, table_name, column_name), false, true, '')))[1]::text,
    'Typed-in email column (personal data)'
  from cols where table_schema = 'public' and column_name ~ 'email' and data_type in ('text', 'character varying', 'citext')
    and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = cols.table_schema and c.relname = cols.table_name and c.relkind = 'r')
),
trig_rows as (
  select 'G' as section, row_number() over (order by n.nspname, c.relname, t.tgname) as sort,
    n.nspname || '.' || c.relname || ' :: ' || t.tgname as item,
    concat_ws(' ', case when t.tgtype & 2 = 2 then 'BEFORE' when t.tgtype & 64 = 64 then 'INSTEAD OF' else 'AFTER' end,
      concat_ws('/', case when t.tgtype & 4 = 4 then 'INSERT' end, case when t.tgtype & 8 = 8 then 'DELETE' end,
        case when t.tgtype & 16 = 16 then 'UPDATE' end, case when t.tgtype & 32 = 32 then 'TRUNCATE' end),
      'calls ' || pf.nspname || '.' || pr.proname, case when t.tgenabled = 'D' then '(disabled)' end) as value,
    case when pr.prosrc ~* '(^|[^a-z_.])(extensions\.)?(http(_get|_post|_put|_patch|_delete|_head)?|dblink(_exec)?)\s*\('
           then 'IMMEDIATE OUTSIDE CALL (http / dblink): would reach the internet even in a dry run. Stop and tell Claude'
         when pf.nspname in ('supabase_functions', 'net') or pr.prosrc ilike '%net.http_%'
           then 'DATABASE WEBHOOK (pg_net): queued, sent only if the transaction COMMITS; a dry run sends nothing'
         when t.tgtype & 8 = 8 and t.tgtype & 2 = 2 then 'Runs before deletes and may refuse them: checked by the reset' end as note
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc pr on pr.oid = t.tgfoid join pg_namespace pf on pf.oid = pr.pronamespace
  where not t.tgisinternal
    and ((n.nspname = 'auth' and c.relname = 'users') or (n.nspname = 'public' and c.relname in ('profiles', 'player_slots'))
      or (n.nspname = 'storage' and c.relname = 'objects') or (n.nspname = 'public' and t.tgtype & 8 = 8)
      or exists (select 1 from graph_edges g where g.child_schema = n.nspname and g.child_table = c.relname)
      or exists (select 1 from roots r where r.root_schema = n.nspname and r.root_table = c.relname)
      or pf.nspname in ('supabase_functions', 'net'))
),
bucket_rows as (
  select 'H' as section, row_number() over (order by b.id) as sort, 'bucket ' || b.id as item,
    case when b.public then 'public' else 'private' end
      || '; files ' || (select count(*) from storage.objects o where o.bucket_id = b.id)
      || '; files owned by a login ' || case when exists (select 1 from cols where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner')
           then (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from storage.objects o where o.bucket_id = %L and o.owner in (select id from auth.users)', b.id), false, true, '')))[1]::text
           else 'unknown (no owner column)' end
      || '; files in a folder named after a login ' || (select count(*) from storage.objects o where o.bucket_id = b.id and split_part(o.name, '/', 1) in (select id::text from auth.users)) as value,
    null::text as note
  from storage.buckets b
),
reached as (select distinct child_schema, child_table from graph_edges union select root_schema, root_table from roots),
-- Anything that could act OUTSIDE the database while a reset script runs (names and counts only).
external_rows as (
  select 'X' as section, 1 as sort, 'extensions that call out IMMEDIATELY (http, dblink, postgres_fdw, wrappers)' as item,
    coalesce((select string_agg(extname, ', ' order by extname) from pg_extension where extname in ('http', 'dblink', 'postgres_fdw', 'wrappers')), 'none') as value,
    'none = no SQL statement can reach the internet before COMMIT' as note
  union all
  select 'X', 2, 'pg_net installed (database webhooks)',
    case when exists (select 1 from pg_extension where extname = 'pg_net') then 'yes' else 'no' end,
    'pg_net only sends after COMMIT: a dry run (ROLLBACK) sends nothing'
  union all
  select 'X', 3, 'scheduled database jobs (pg_cron), active',
    case when to_regclass('cron.job') is null then 'not installed'
      else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where active', false, true, '')))[1]::text end,
    'Jobs could write while a reset runs; pause them in the reset window'
  union all
  select 'X', 4, 'touched tables broadcast by Realtime',
    (select count(*)::text from pg_publication_tables p join reached r on r.child_schema = p.schemaname and r.child_table = p.tablename where p.pubname = 'supabase_realtime'),
    'Realtime only announces COMMITTED changes: a dry run announces nothing'
),
untouched_rows as (
  select 'I' as section, row_number() over (order by c.relname) as sort, 'public.' || c.relname as item,
    'rows ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text as value,
    null::text as note
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from reached r where r.child_schema = 'public' and r.child_table = c.relname)
),
all_rows as (
  select section, sort, item, value, note from counted
  union all select section, sort, item, value, note from roles
  union all select section, sort, item, value, note from graph_rows
  union all select section, sort, item, value, note from loose_rows
  union all select section, sort, item, value, note from trig_rows
  union all select section, sort, item, value, note from bucket_rows
  union all select section, sort, item, value, note from untouched_rows
  union all select section, sort, item, value, note from external_rows
),
numbered as (select row_number() over (order by section, sort, item) + 1 as row_no, section, item, value, note from all_rows)
select 1 as row_no, '0' as section, 'Read me first' as item, (select count(*) + 1 from numbered)::text || ' rows expected' as value,
  'READ ONLY. Counts and structure only; no personal data.' as note
union all
select row_no, section, item, value, note from numbered
order by row_no;
