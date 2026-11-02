// LOCAL rehearsal of the production account reset (architecture doc, step L6), on the sanitized maroon-legacy copy.
//   node scripts/legacy-local/rehearse-reset.mjs --confirm maroon-legacy [--scope scope.json]
//
// Builds ONE transaction from the reviewed drafts and ALWAYS ends with ROLLBACK, so the legacy copy is unchanged:
//   history fingerprints (before) -> Part 1 (shared golf records, groups S1-S7) -> Part 2 (accounts) -> history
//   fingerprints (after) -> checks -> a simulated fresh V2 owner sign-up + owner re-grant and an organizer re-grant ->
//   checks -> ROLLBACK.
// Checks: zero legacy logins / identities / sessions / tokens; every Maroon history table identical apart from emptied
// account links, typed-in contact details and claim bookkeeping; no history row linked to the new account; owner and
// organizer powers granted exactly once. Any failure raises an error and stops the transaction (nothing changes).
// Step 0 numbers are read from the copy itself; production uses the owner's approved inspection numbers instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY, confirmed } from "./guard.mjs";
import { psqlLegacy } from "./local.mjs";

export const DEFAULT_SCOPE = { S1: "delete", S2: "delete", S3: "delete", S4: "delete", S5: "delete", S6: "delete", S7: "delete" };
const OWNER = "0f0f0f0f-0000-4000-8000-000000000001";
const ORGANIZER = "0f0f0f0f-0000-4000-8000-000000000002";

/** Inserts `block` right before the `do $$` that contains `marker`; the marker must occur exactly once. */
function insertBefore(sql, marker, block, file) {
  const at = sql.indexOf(marker);
  if (at < 0 || sql.indexOf(marker, at + 1) >= 0) throw new Error(`${file} changed: step-0 marker not found exactly once. Update rehearse-reset.mjs after review.`);
  const doAt = sql.lastIndexOf("do $$", at);
  return sql.slice(0, doAt) + block + "\n" + sql.slice(doAt);
}
/** Removes the draft's own begin; and final rollback; so all parts share the rehearsal's single transaction. */
function body(sql, file) {
  const begin = sql.match(/^begin;\s*$/m), end = sql.match(/^rollback;\s*$/m);
  if (!begin || !end) throw new Error(`${file} changed: begin; / rollback; not found. Update rehearse-reset.mjs after review.`);
  return sql.replace(/^begin;\s*$/m, "").replace(/^rollback;\s*$/m, "");
}

function fakeSignup(id, email, name, username) {
  return `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now());
do $$ begin
  -- V2 makes the profile through initialize_my_profile when installed; the old design needs name + username at insert.
  if to_regprocedure('public.initialize_my_profile(uuid)') is not null then
    perform public.initialize_my_profile('${id}');
    update public.profiles set display_name = '${name}', username = '${username}' where id = '${id}';
  else
    insert into public.profiles (id, email, display_name, username) values ('${id}', '${email}', '${name}', '${username}');
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'activated_at') then
    perform set_config('maroon.activation', 'on', true);
    update public.profiles set activated_at = now() where id = '${id}';
    perform set_config('maroon.activation', 'off', true);
  end if;
end $$;`;
}

export function buildRehearsalSql(root = process.cwd(), scope = DEFAULT_SCOPE) {
  for (const grp of Object.keys(DEFAULT_SCOPE)) if (!["delete", "keep"].includes(scope[grp])) throw new Error(`Scope ${grp} must be "delete" or "keep".`);
  const read = (...p) => readFileSync(join(root, ...p), "utf8");
  const snapshot = read("scripts", "legacy-local", "history-snapshot.sql");
  const p1file = "docs/account-reset-part1-shared-data-DRAFT.sql", p2file = "docs/account-reset-part2-accounts-DRAFT.sql", rgfile = "docs/admin-regrant-DRAFT.sql";

  const part1 = insertBefore(body(read(p1file), p1file), "if exists (select 1 from reset_scope where decision is null)", `
-- rehearsal: scope and step-0 numbers come from this copy
update reset_scope s set decision = c.decision from (values ${Object.entries(scope).map(([g, d]) => `('${g}', '${d}')`).join(", ")}) c(grp, decision) where s.grp = c.grp;
do $$ declare r record; v bigint; begin
  for r in select * from reset_expected loop
    begin execute r.sql into v; exception when undefined_table or undefined_column then v := 0; end;
    update reset_expected set n = v where item = r.item;
  end loop;
end $$;`, p1file);

  const part2 = insertBefore(body(read(p2file), p2file), "if exists (select 1 from reset_expected where n is null) or exists (select 1 from reset_options where value is null)", `
-- rehearsal: step-0 numbers from this copy; the sign-in log option stays "no" (decision D6 on hold)
update reset_expected set n = (select count(*) from auth.users) where item = 'auth.users';
update reset_expected set n = (select count(*) from public.profiles) where item = 'public.profiles';
update reset_options set value = 'no';`, p2file);

  const regrant = (email, kind) => body(read(rgfile), rgfile)
    .replace("insert into regrant_input values (null, null);", `insert into regrant_input values ('${email}', '${kind}');`)
    .replace(/^create temp table regrant_input/m, "drop table if exists regrant_input;\ncreate temp table regrant_input");

  return `\\set ON_ERROR_STOP on
begin;
-- ===== history BEFORE =====
${snapshot.replaceAll("__PHASE__", "before")}
-- ===== PART 1 =====
${part1}
drop table reset_expected; drop table reset_counts;
-- ===== PART 2 =====
${part2}
-- ===== history AFTER and checks =====
${snapshot.replaceAll("__PHASE__", "after")}
do $$
declare bad text; t text; v bigint;
begin
  select string_agg(b.tbl || ' (rows ' || b.n || ' -> ' || coalesce(a.n::text, 'missing') || case when a.fp is distinct from b.fp then ', content changed' else '' end || ')', '; ')
    into bad from history_fp b left join history_fp a on a.tbl = b.tbl and a.phase = 'after'
    where b.phase = 'before' and (a.tbl is null or a.n <> b.n or a.fp <> b.fp);
  if bad is not null then raise exception 'REHEARSAL FAILED: Maroon history changed: %', bad; end if;
  foreach t in array array['users', 'identities', 'sessions', 'refresh_tokens', 'one_time_tokens', 'mfa_factors', 'flow_state'] loop
    if to_regclass('auth.' || t) is not null then
      execute format('select count(*) from auth.%I', t) into v;
      if v <> 0 then raise exception 'REHEARSAL FAILED: auth.% still has % row(s).', t, v; end if;
    end if;
  end loop;
end $$;
-- ===== fresh V2 sign-ups and explicit re-grants =====
${fakeSignup(OWNER, "rehearsal-owner@legacy.invalid", "Rehearsal Owner", "rehearsal_owner")}
${fakeSignup(ORGANIZER, "rehearsal-organizer@legacy.invalid", "Rehearsal Organizer", "rehearsal_organizer")}
${regrant("rehearsal-owner@legacy.invalid", "owner")}
${regrant("rehearsal-organizer@legacy.invalid", "organizer")}
do $$
declare v bigint; c record;
begin
  -- No automatic relinking: no history row may point at either new account.
  for c in select n.nspname, k.relname, a.attname from pg_constraint con
      join pg_class k on k.oid = con.conrelid join pg_namespace n on n.oid = k.relnamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
      join pg_class p on p.oid = con.confrelid join pg_namespace pn on pn.oid = p.relnamespace
    where con.contype = 'f' and ((pn.nspname = 'public' and p.relname = 'profiles') or (pn.nspname = 'auth' and p.relname = 'users'))
      and k.relname in (select tbl from history_fp where phase = 'after') loop
    execute format('select count(*) from %I.%I where %I in (''${OWNER}'', ''${ORGANIZER}'')', c.nspname, c.relname, c.attname) into v;
    if v > 0 then raise exception 'REHEARSAL FAILED: %.%.% was relinked to a new account.', c.nspname, c.relname, c.attname; end if;
  end loop;
  if (select count(*) from public.profiles where is_host) <> 1 or not exists (select 1 from public.profiles where id = '${OWNER}' and is_host) then
    raise exception 'REHEARSAL FAILED: owner re-grant did not give exactly one Maroon admin.'; end if;
  if exists (select 1 from public.profiles where id = '${ORGANIZER}' and is_host) then raise exception 'REHEARSAL FAILED: the organizer became an admin.'; end if;
  if to_regclass('public.tournament_members') is not null then
    execute 'select count(*) from public.tournament_members where profile_id = $1 and role = ''organizer''' into v using '${ORGANIZER}'::uuid;
    if v <> 1 then raise exception 'REHEARSAL FAILED: organizer membership not granted.'; end if;
  end if;
end $$;
select 'REHEARSAL PASSED' as result, (select count(*) from history_fp where phase = 'after') as history_tables_unchanged,
  (select coalesce(sum(n), 0) from history_fp where phase = 'after') as history_rows_unchanged;
rollback;
`;
}

if (process.argv[1]?.endsWith("rehearse-reset.mjs")) {
  try {
    const args = process.argv.slice(2);
    if (!confirmed(args)) throw new Error(`Type --confirm ${LEGACY.project} to rehearse on the local legacy copy (it always rolls back).`);
    const state = psqlLegacy("select state from legacy_meta.restore_log order by restored_at desc limit 1;").trim();
    if (state !== "sanitized") throw new Error("Rehearse only on the SANITIZED copy (run sanitize.mjs first).");
    const scopeAt = args.indexOf("--scope");
    const scope = scopeAt >= 0 ? { ...DEFAULT_SCOPE, ...JSON.parse(readFileSync(args[scopeAt + 1], "utf8")) } : DEFAULT_SCOPE;
    const out = psqlLegacy(buildRehearsalSql(process.cwd(), scope), { user: "supabase_admin", quiet: true });
    console.log(out.trim());
    if (!out.includes("REHEARSAL PASSED")) throw new Error("The rehearsal did not report PASSED.");
    console.log("Rehearsal passed and was rolled back: the legacy copy is unchanged.");
  } catch (error) {
    console.error(`REHEARSAL STOPPED (rolled back, nothing changed). ${error.message}`);
    process.exit(1);
  }
}
