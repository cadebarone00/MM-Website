-- scripts/legacy-local/history-snapshot.sql — used by rehearse-reset.mjs (twice: __PHASE__ = before / after).
-- Fingerprints every INDEPENDENT Maroon Masters history table: archived scorecards and shot videos, career archive and
-- stats, edition rosters / teams / rounds / courses / settings, live scoring, handicap rounds, broadcast, odds, player
-- records and overrides, season calendar, The Maroon's tournament / editions / players / organization / activity, and
-- historical imports. Tournament- or edition-scoped tables are limited to The Maroon (is_legacy) rows, because customer
-- tournaments are removed on purpose (group S5).
--
-- A row's fingerprint ignores ONLY what the reset may legitimately change: columns linking to an account (they become
-- empty), typed-in contact details (emails / phones, group S7) and claim bookkeeping (claimed_at, claim_locked_*, and
-- player_slots.password_created, which a trigger derives from the claim).
-- Every other value, and the number of rows, must be identical before and after.

create temp table if not exists history_fp (phase text, tbl text, n bigint, fp text, primary key (phase, tbl));
do $$
declare
  t record; excl text[]; filt text; v_n bigint; v_fp text;
  has_maroon boolean := to_regclass('public.tournaments') is not null
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'is_legacy');
  maroon_t text := '(tournament_id is null or tournament_id in (select id from public.tournaments where is_legacy))';
  maroon_e text := '(edition_id is null or edition_id in (select e.id from public.tournament_editions e join public.tournaments m on m.id = e.tournament_id where m.is_legacy))';
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname ~ '^(archived_|broadcast_|career_|edition_|handicap_|live_|odds_model_|player_profile_|historical_)'
           or c.relname in ('player_slots', 'round_format_setups', 'season_calendar', 'tournament_editions', 'tournaments',
                            'tournament_players', 'organizations', 'tournament_activity'))
      and c.relname <> 'historical_link_requests'   -- a person's own claim requests: account-only, removed with them
    order by c.relname loop
    select coalesce(array_agg(a.attname::text), '{}') into excl
    from pg_attribute a
    where a.attrelid = format('public.%I', t.relname)::regclass and a.attnum > 0 and not a.attisdropped
      and (a.attname ~ '(^|_)(email|phone)($|_)' or a.attname in ('claimed_at', 'claim_locked_at', 'claim_locked_reason', 'password_created')
           or exists (select 1 from pg_constraint con join pg_class p on p.oid = con.confrelid join pg_namespace pn on pn.oid = p.relnamespace
                      where con.conrelid = a.attrelid and con.contype = 'f' and a.attnum = any(con.conkey)
                        and ((pn.nspname = 'public' and p.relname = 'profiles') or (pn.nspname = 'auth' and p.relname = 'users'))));
    filt := case
      when not has_maroon then 'true'
      when t.relname = 'tournaments' then 'is_legacy'
      when t.relname = 'organizations' then 'id in (select organization_id from public.tournaments where is_legacy)'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.relname and column_name = 'tournament_id') then maroon_t
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.relname and column_name = 'edition_id') then maroon_e
      else 'true' end;
    execute format('select count(*), coalesce(md5(string_agg(h, '''' order by h)), '''') from (select md5((to_jsonb(x) - %L::text[])::text) as h from public.%I x where %s) s',
      excl, t.relname, filt) into v_n, v_fp;
    insert into history_fp values ('__PHASE__', t.relname, v_n, v_fp)
    on conflict (phase, tbl) do update set n = excluded.n, fp = excluded.fp;
  end loop;
end $$;
