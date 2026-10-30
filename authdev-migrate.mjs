// maroon-auth-dev database runner (this worktree only; not committed). Stages A + B, and Stage C only when asked for.
//   node authdev-migrate.mjs                 settings checks only, no connection (lists the files + fingerprints)
//   node authdev-migrate.mjs --preflight     READ-ONLY checks on the dev database (identity, empty, extensions, rights)
//   node authdev-migrate.mjs --status        READ-ONLY: which files are recorded as applied
//   node authdev-migrate.mjs --verify        READ-ONLY: Stage A / B checks, plus Stage C checks once Stage C is recorded
//   node authdev-migrate.mjs --show-sql      print the read-only SQL used by --preflight / --verify (no connection)
//   node authdev-migrate.mjs --apply --confirm llqqddiundaptmsgccwj [--through 42]
//                                            run the files in order; stops at the first error
//   node authdev-migrate.mjs --preflight --stage C               READ-ONLY: is the database ready for Stage C?
//   node authdev-migrate.mjs --apply --stage C --confirm llqqddiundaptmsgccwj
//                                            files 45-46 only, after all 44 are recorded
// It refuses to connect anywhere but the maroon-auth-dev project and never prints a key or the database password.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
// The ONLY project this runner will ever touch. Hard-coded on purpose: a settings file can't widen it.
const DEV_REF = "llqqddiundaptmsgccwj";
const APP_ENV = join(ROOT, ".env.development.local");
// The database connection lives in its own git-ignored file, which Next.js never loads, so the password never reaches the site.
const DB_ENV = resolve(process.env.AUTHDEV_DB_ENV ?? join(ROOT, ".env.authdev-db.local"));
const PROD_ENV = resolve(process.env.AUTHDEV_PROD_ENV ?? join(ROOT, "..", "MM-Website", ".env"));
const PSQL = process.env.AUTHDEV_PSQL ?? "psql";

// Stage A (scripts/auth-local/setup.mjs order) then Stage B. Nothing outside this list can run.
const STAGE_A = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "player_slots_email.sql", "player_slots_full_name.sql", "tournament_timezone.sql", "platform_foundation.sql",
  "platform_editions.sql", "platform_create_tournament.sql", "platform_dashboard.sql", "platform_public_site.sql",
  "platform_access_requests.sql", "platform_past_editions.sql", "platform_active_editions.sql", "platform_activity.sql",
  "profile_identity.sql", "tournament_player_identity.sql", "player_slots_password_created.sql", "golf_trips.sql",
  "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql",
  "golf_trip_scoring_corrections.sql", "shared_rounds.sql", "profile_v1.sql", "profile_photos.sql",
  "profile_initialization.sql", "account_deletion.sql",
];
const STAGE_B = ["profile_friends.sql", "profile_read_model.sql"];
const FILES = [...STAGE_A, ...STAGE_B];
// Stage C (V2 onboarding foundation): only these two files, only with --stage C, and only the versions reviewed on
// 2026-10-29. If either file changes, the runner refuses until it is reviewed again and these fingerprints updated.
const STAGE_C = ["account_activation.sql", "auth_code_attempts.sql"];
const STAGE_C_SHA256 = {
  "account_activation.sql": "e76d9176d62f51bc990f5581eaca0ab1d9e16b8b92c4aedcca2a5dec6d124836",
  "auth_code_attempts.sql": "c35768af99be922966e382274483aa6c917ee6ac1a57305d8a812a8988c81aa4",
};
const ALL_FILES = [...FILES, ...STAGE_C];
// Enforcement (Stage D) is NOT approved. Belt and braces: refuse to start if it ever lands in the list.
const NEVER = ["account_activation_enforcement.sql"];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined; };
const MODE = has("--apply") ? "apply" : has("--preflight") ? "preflight" : has("--status") ? "status"
  : has("--verify") ? "verify" : has("--show-sql") ? "show-sql" : "plan";
const STAGE = valueOf("--stage");
const STAGE_C_RUN = STAGE === "C";

const problems = [];
const fail = (message) => problems.push(message);
const ok = (message) => console.log(`  ok  ${message}`);
function stopIfProblems(title) {
  if (!problems.length) return;
  console.log(`\n${title}:`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

/** KEY=VALUE lines; # comments and blank lines skipped; surrounding quotes removed. Values are never printed. */
function readEnv(file) {
  const values = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    values[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// ===================================================================================================================
// Read-only SQL. Each query returns rows of: check <tab> value. Wrapped in a READ ONLY transaction that is rolled back.
// ===================================================================================================================
const PREFLIGHT_SQL = `
select 'database', current_database()::text
union all select 'login_role', current_user::text
union all select 'server_version_num', current_setting('server_version_num')
union all select 'supabase_schemas', (select count(*)::text from pg_namespace where nspname in ('auth', 'storage', 'realtime', 'extensions', 'graphql_public'))
union all select 'transaction_read_only', current_setting('transaction_read_only')
-- empty test database
union all select 'public_tables', (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm'))
union all select 'public_functions', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
union all select 'auth_users', (select count(*)::text from auth.users)
union all select 'storage_buckets', (select count(*)::text from storage.buckets)
union all select 'realtime_publication_tables', (select count(*)::text from pg_publication_tables where pubname = 'supabase_realtime')
union all select 'ledger_schema_exists', (to_regnamespace('authdev_meta') is not null)::text
union all select 'blocked_objects_present', ((to_regclass('public.account_activation_settings') is not null) or (to_regclass('public.auth_code_attempts') is not null))::text
-- extensions
union all select 'extensions_installed', (select string_agg(extname || ' ' || extversion, ', ' order by extname) from pg_extension)
union all select 'pg_cron_installed', exists (select 1 from pg_extension where extname = 'pg_cron')::text
-- privileges the 44 files need
union all select 'is_superuser', (select rolsuper::text from pg_roles where rolname = current_user)
union all select 'can_create_in_public', has_schema_privilege('public', 'CREATE')::text
union all select 'auth_users_references', has_table_privilege('auth.users', 'REFERENCES')::text
union all select 'auth_users_trigger', has_table_privilege('auth.users', 'TRIGGER')::text
union all select 'storage_buckets_insert', has_table_privilege('storage.buckets', 'INSERT')::text
union all select 'storage_buckets_has_limit_columns', ((select count(*) from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name in ('file_size_limit', 'allowed_mime_types')) = 2)::text
union all select 'storage_objects_owner', (select pg_get_userbyid(relowner)::text from pg_class where oid = 'storage.objects'::regclass)
-- Supabase's supautils lets members of supabase_privileged_role add policies to storage.objects without owning it.
union all select 'can_policy_storage_objects', ((select pg_has_role(current_user, relowner, 'USAGE') from pg_class where oid = 'storage.objects'::regclass)
  or (exists (select 1 from pg_roles where rolname = 'supabase_privileged_role') and pg_has_role(current_user, 'supabase_privileged_role', 'MEMBER')))::text
union all select 'realtime_publication_owner', coalesce((select pg_get_userbyid(pubowner)::text from pg_publication where pubname = 'supabase_realtime'), 'MISSING')
union all select 'can_alter_realtime_publication', coalesce((select pg_has_role(current_user, pubowner, 'USAGE') from pg_publication where pubname = 'supabase_realtime'), false)::text
union all select 'authenticator_exists', exists (select 1 from pg_roles where rolname = 'authenticator')::text
union all select 'authenticator_settings', coalesce((select array_to_string(setconfig, ', ') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator' and s.setdatabase = 0), '(none)')
union all select 'can_alter_authenticator', ((select rolsuper from pg_roles where rolname = current_user)
  or ((select rolcreaterole from pg_roles where rolname = current_user)
      and exists (select 1 from pg_auth_members m where m.roleid = 'authenticator'::regrole and m.member = current_user::regrole and m.admin_option)))::text
-- functions / roles the files call or grant to
union all select 'auth_uid', (to_regprocedure('auth.uid()') is not null)::text
union all select 'gen_random_uuid', (to_regprocedure('gen_random_uuid()') is not null)::text
union all select 'api_roles', ((select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) = 3)::text
`;

const VERIFY_SQL = `
select 'ledger_files', case when to_regclass('authdev_meta.applied_files') is null then '0' else (select count(*)::text from authdev_meta.applied_files) end
union all select 'profiles_rows', (select count(*)::text from public.profiles)
union all select 'player_slots_rows', (select count(*)::text from public.player_slots)
-- Stage A: sign-in, profile setup, deletion
union all select 'stageA_functions', (select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname in ('initialize_my_profile', 'complete_my_profile', 'account_deletion_state', 'session_is_revoked', 'reject_deleted_accounts', 'account_is_active'))
union all select 'pre_request_hook', coalesce((select array_to_string(setconfig, ', ') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator' and s.setdatabase = 0), '(none)')
union all select 'restrictive_policies', (select count(*)::text from pg_policies where policyname = 'active_account_only')
union all select 'storage_objects_policy', exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'active_account_only')::text
union all select 'auth_users_trigger', exists (select 1 from pg_trigger where tgname = 'sync_player_slot_password_created' and tgrelid = 'auth.users'::regclass)::text
union all select 'buckets', (select string_agg(id, ',' order by id) from storage.buckets where id in ('profile-photos', 'shot-videos'))
union all select 'public_tables_without_rls', coalesce((select string_agg(c.relname, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), '(none)')
union all select 'cron_job_scheduled', (to_regnamespace('cron') is not null)::text
-- Stage B
union all select 'stageB_functions', coalesce((select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname in ('search_golfers', 'my_friend_requests', 'get_profile_history')), '(none)')
-- NOT approved: all of these must be absent / false
union all select 'activation_tables', ((to_regclass('public.account_activation_settings') is not null) or (to_regclass('public.legal_document_versions') is not null))::text
union all select 'activated_at_column', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'activated_at')::text
union all select 'auth_code_attempts', (to_regclass('public.auth_code_attempts') is not null)::text
-- (require_complete_profile itself is Stage A, from profile_initialization.sql; only enforcement adds these.)
union all select 'enforcement_objects', ((to_regprocedure('public.profile_can_participate(uuid)') is not null)
  or exists (select 1 from pg_trigger where tgname in ('require_participating_handoff_target', 'withdraw_handoffs_to_restricted_account')))::text
union all select 'enforcement_renames', ((to_regprocedure('public.search_golfers_all(uuid, text)') is not null) or (to_regprocedure('public.get_profile_history_all(uuid, uuid)') is not null))::text
`;

const STATUS_SQL = `
select seq::text, file, sha256, to_char(applied_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS "UTC"') from authdev_meta.applied_files order by applied_files.seq
`;

// Created on the first --apply only (never by --preflight). Not in an API-exposed schema; no browser role can see it.
const LEDGER_SQL = `
create schema if not exists authdev_meta;
revoke all on schema authdev_meta from public, anon, authenticated;
create table if not exists authdev_meta.applied_files (
  seq integer primary key,
  file text not null unique,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
revoke all on authdev_meta.applied_files from public, anon, authenticated;
`;

// === Stage C ========================================================================================================
const ENFORCEMENT_PRESENT = `((to_regprocedure('public.profile_can_participate(uuid)') is not null)
  or exists (select 1 from pg_trigger where tgname in ('require_participating_handoff_target', 'withdraw_handoffs_to_restricted_account'))
  or (to_regprocedure('public.search_golfers_all(uuid, text)') is not null) or (to_regprocedure('public.get_profile_history_all(uuid, uuid)') is not null))::text`;

// Read only. Before Stage C: what account_activation.sql / auth_code_attempts.sql need, and that neither is installed yet.
const STAGE_C_PREFLIGHT_SQL = `
select 'transaction_read_only', current_setting('transaction_read_only')
union all select 'activation_objects', ((to_regclass('public.account_activation_settings') is not null) or (to_regclass('public.legal_document_versions') is not null)
  or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'activated_at')
  or (to_regprocedure('public.account_lifecycle_state(uuid)') is not null))::text
union all select 'auth_code_objects', ((to_regclass('public.auth_code_attempts') is not null) or (to_regprocedure('public.claim_auth_code_attempt(text, text)') is not null))::text
union all select 'dependency_tables', (select count(*)::text from unnest(array['profiles', 'golf_trip_members', 'account_deletions', 'player_slots']) t where to_regclass('public.' || t) is not null)
union all select 'dependency_functions', (select count(*)::text from unnest(array['public.golf_trip_invite_hash(text)', 'public.initialize_my_profile(uuid)',
  'public.profile_display_name_problem(text)', 'public.request_account_deletion(uuid)', 'public.session_is_revoked()']) f where to_regprocedure(f) is not null)
union all select 'enforcement_present', ${ENFORCEMENT_PRESENT}
union all select 'activation_flag_preset', exists (select 1 from pg_db_role_setting, unnest(setconfig) c where c like 'maroon.activation%')::text
union all select 'service_role', exists (select 1 from pg_roles where rolname = 'service_role')::text
union all select 'auth_users', (select count(*)::text from auth.users)
union all select 'profiles', (select count(*)::text from public.profiles)
`;

const STAGE_C_TABLES = `array['account_activation_settings', 'legal_document_versions', 'account_birthdates', 'account_eligibility',
  'terms_acceptances', 'pending_invitations', 'birthdate_corrections', 'auth_code_attempts']`;
const STAGE_C_FUNCTIONS = `array['public.account_lifecycle_state(uuid)', 'public.account_onboarding_progress(uuid)', 'public.set_my_birthdate(uuid, date)',
  'public.record_terms_acceptance(uuid, text, text, text)', 'public.activate_my_profile(uuid)', 'public.hold_golf_trip_invitation(uuid, text)',
  'public.revoke_account_sessions(uuid)', 'public.close_ineligible_registration(uuid, boolean)', 'public.request_birthdate_correction(uuid, text)',
  'public.claim_auth_code_attempt(text, text)', 'public.clear_auth_code_attempts(text, text)']`;
// Read only. Only run once files 45-46 are recorded (it names Stage C tables directly).
const STAGE_C_VERIFY_SQL = `
select 'tables_present', (select count(*)::text from unnest(${STAGE_C_TABLES}) t where to_regclass('public.' || t) is not null)
union all select 'tables_rls_on', (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any(${STAGE_C_TABLES}) and c.relrowsecurity)
union all select 'tables_browser_access', coalesce((select string_agg(t || ':' || r, ',') from unnest(${STAGE_C_TABLES}) t, unnest(array['anon', 'authenticated']) r
  where has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE')), '(none)')
union all select 'functions_present', (select count(*)::text from unnest(${STAGE_C_FUNCTIONS}) f where to_regprocedure(f) is not null)
union all select 'functions_browser_exec', coalesce((select string_agg(f || ':' || r, ',') from unnest(${STAGE_C_FUNCTIONS}) f, unnest(array['anon', 'authenticated']) r
  where has_function_privilege(r, f, 'EXECUTE')), '(none)')
union all select 'functions_service_exec', (select count(*)::text from unnest(${STAGE_C_FUNCTIONS}) f where has_function_privilege('service_role', f, 'EXECUTE'))
union all select 'settings_rows', (select count(*)::text from public.account_activation_settings)
union all select 'activation_enabled', coalesce((select activation_enabled::text from public.account_activation_settings where id), '(missing)')
union all select 'legal_versions', coalesce((select string_agg(document || '=' || current_version, ',' order by document) from public.legal_document_versions), '(none)')
union all select 'activated_profiles', (select count(*)::text from public.profiles where activated_at is not null)
union all select 'guard_trigger', exists (select 1 from pg_trigger where tgname = 'guard_profile_activation' and tgrelid = 'public.profiles'::regclass)::text
union all select 'private_rows', ((select count(*) from public.account_birthdates) + (select count(*) from public.account_eligibility) + (select count(*) from public.terms_acceptances)
  + (select count(*) from public.pending_invitations) + (select count(*) from public.birthdate_corrections) + (select count(*) from public.auth_code_attempts))::text
union all select 'account_is_active_unchanged', (select (prosrc not like '%account_eligibility%')::text from pg_proc where oid = 'public.account_is_active()'::regprocedure)
union all select 'enforcement_present', ${ENFORCEMENT_PRESENT}
`;

// NOT run by this runner, ever. The two dev-only settings the V2 flow needs AFTER Stage C is installed and verified, each
// with its own approval, typed by hand in the maroon-auth-dev SQL editor. Kept here so the exact text is reviewed once.
const STAGE_C_LATER_DEV_ONLY_SQL = `
-- maroon-auth-dev ONLY (dashboard must say maroon-auth-dev; URL must contain ${DEV_REF}). Never production.
-- 1. Test versions of the legal documents (final legal text is a launch blocker; these are placeholders for testing).
insert into public.legal_document_versions (document, current_version)
values ('terms', 'dev-test-2026-10-29'), ('privacy', 'dev-test-2026-10-29')
on conflict (document) do update set current_version = excluded.current_version, effective_at = now();
-- 2. Let Finish activate accounts on this dev project.
update public.account_activation_settings set activation_enabled = true, updated_at = now() where id;
-- Undo (dev): update public.account_activation_settings set activation_enabled = false, updated_at = now() where id;
--             delete from public.legal_document_versions where current_version = 'dev-test-2026-10-29';
`;

const readOnly = (sql) => `begin transaction read only;\n${sql};\nrollback;\n`;

if (MODE === "show-sql") {
  console.log("-- === --preflight (read only) ===\n" + readOnly(PREFLIGHT_SQL));
  console.log("-- === --verify (read only) ===\n" + readOnly(VERIFY_SQL));
  console.log("-- === --status (read only) ===\n" + readOnly(STATUS_SQL));
  console.log("-- === ledger, created by the first --apply only ===" + LEDGER_SQL);
  console.log("-- === --preflight --stage C (read only) ===\n" + readOnly(STAGE_C_PREFLIGHT_SQL));
  console.log("-- === --verify, Stage C part (read only) ===\n" + readOnly(STAGE_C_VERIFY_SQL));
  console.log("-- === LATER, dev-only, NOT run by this runner ===" + STAGE_C_LATER_DEV_ONLY_SQL);
  process.exit(0);
}

// ===================================================================================================================
// 1. Settings checks (no connection).
// ===================================================================================================================
console.log(`maroon-auth-dev database runner — mode: ${MODE}`);

if (basename(ROOT) !== "MM-Website-authdev") fail(`This runner only works in the MM-Website-authdev folder (found "${basename(ROOT)}").`);
for (const name of NEVER) if (ALL_FILES.includes(name)) fail(`${name} is not approved and must not be in the list.`);
if (FILES.length !== 44 || new Set(FILES).size !== 44) fail(`Expected 44 different files, found ${new Set(FILES).size}.`);
if (ALL_FILES.length !== 46 || new Set(ALL_FILES).size !== 46) fail(`Expected 46 different files with Stage C, found ${new Set(ALL_FILES).size}.`);
if (STAGE !== undefined && !STAGE_C_RUN) fail("--stage only accepts C.");
if (STAGE_C_RUN && !["preflight", "apply", "plan"].includes(MODE)) fail("--stage C goes with --preflight or --apply (--status and --verify include Stage C on their own).");
const missingFiles = ALL_FILES.filter((name) => !existsSync(join(ROOT, "supabase", name)));
if (missingFiles.length) fail(`Missing SQL files: ${missingFiles.join(", ")}.`);
const stageCChanged = STAGE_C.filter((name) => existsSync(join(ROOT, "supabase", name)) && sha256(join(ROOT, "supabase", name)) !== STAGE_C_SHA256[name]);
if (STAGE_C_RUN && stageCChanged.length) fail(`${stageCChanged.join(", ")} changed since it was reviewed. Review it again before Stage C.`);
// psql reads these from the terminal and could quietly point it somewhere else; the runner sets its own.
const pgShell = Object.keys(process.env).filter((name) => /^PG/.test(name) || /SUPABASE|DATABASE_URL/i.test(name));
if (pgShell.length) fail(`Database settings are set in this terminal (${pgShell.join(", ")}). Open a fresh terminal without them.`);

if (!existsSync(APP_ENV)) fail("Missing .env.development.local (the dev site settings).");
else {
  const app = readEnv(APP_ENV);
  if ((app.AUTHDEV_SUPABASE_REF ?? "").toLowerCase() !== DEV_REF) fail(`AUTHDEV_SUPABASE_REF in .env.development.local is not ${DEV_REF}.`);
  if ((app.SUPABASE_URL ?? "").replace(/\/+$/, "") !== `https://${DEV_REF}.supabase.co`) fail(`SUPABASE_URL in .env.development.local is not https://${DEV_REF}.supabase.co.`);
}

if (!existsSync(PROD_ENV)) fail("Can't find the main folder's .env to compare against, so production can't be ruled out. Stopping.");
const prod = existsSync(PROD_ENV) ? readEnv(PROD_ENV) : {};
const prodRef = (() => { try { return new URL(prod.SUPABASE_URL).hostname.split(".")[0].toLowerCase(); } catch { return null; } })();
if (existsSync(PROD_ENV) && !prodRef) fail("The main folder's .env has no SUPABASE_URL to compare against. Stopping.");
if (prodRef === DEV_REF) fail("The production project and the dev project have the same id. Stopping.");

let conn = null;
if (MODE !== "plan") {
  if (!existsSync(DB_ENV)) fail(`Missing ${basename(DB_ENV)}. It holds AUTHDEV_DB_URL (see the setup steps).`);
  else {
    const db = readEnv(DB_ENV);
    const unexpected = Object.keys(db).filter((name) => name !== "AUTHDEV_DB_URL");
    if (unexpected.length) fail(`${basename(DB_ENV)} may only contain AUTHDEV_DB_URL (found ${unexpected.join(", ")}).`);
    conn = parseDbUrl(db.AUTHDEV_DB_URL ?? "");
    if (conn) {
      if (prodRef && JSON.stringify(conn).toLowerCase().includes(prodRef)) fail("AUTHDEV_DB_URL mentions the PRODUCTION project. Stopping.");
      const prodValues = Object.values(prod).filter((value) => value && value.length >= 8);
      if (prodValues.includes(conn.password) || prodValues.includes(db.AUTHDEV_DB_URL)) fail("AUTHDEV_DB_URL reuses a value from the PRODUCTION .env. Stopping.");
    }
  }
}

/** Only two shapes are accepted, and both name the dev project: the direct host, or the session pooler with user postgres.<ref>. */
function parseDbUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { fail("AUTHDEV_DB_URL isn't a valid postgresql:// address."); return null; }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) { fail("AUTHDEV_DB_URL must start with postgresql://"); return null; }
  const host = url.hostname.toLowerCase(), user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
  const port = url.port || "5432", dbname = url.pathname.replace(/^\//, "") || "postgres";
  const direct = host === `db.${DEV_REF}.supabase.co` && user === "postgres";
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user === `postgres.${DEV_REF}`;
  if (!direct && !pooler) { fail(`AUTHDEV_DB_URL must be the maroon-auth-dev "Direct connection" (db.${DEV_REF}.supabase.co, user postgres) or "Session pooler" (user postgres.${DEV_REF}) address.`); return null; }
  if (port !== "5432") { fail("Use port 5432 (session pooler or direct). The 6543 transaction pooler isn't suitable for migrations."); return null; }
  if (dbname !== "postgres") { fail("The database name in AUTHDEV_DB_URL must be postgres."); return null; }
  if (!password || password.includes("[YOUR-PASSWORD]") || password.includes("YOUR-PASSWORD")) { fail("Put the dev database password into AUTHDEV_DB_URL (replace [YOUR-PASSWORD])."); return null; }
  return { host, port, user, password, kind: direct ? "direct" : "session pooler" };
}

stopIfProblems("STOPPED BEFORE CONNECTING");
ok("running in MM-Website-authdev; .env.development.local points at maroon-auth-dev");
ok(`production project (${prodRef?.slice(0, 4)}…) is a different project`);
ok(`46 files present (Stage A: ${STAGE_A.length}, Stage B: ${STAGE_B.length}, Stage C: ${STAGE_C.length}); enforcement file excluded`);
if (stageCChanged.length) console.log(`  note ${stageCChanged.join(", ")} differs from the reviewed version (Stage C will refuse)`);

if (MODE === "plan") {
  console.log("\nFiles, in order (sha256 fingerprint, first 12 characters):");
  ALL_FILES.forEach((name, i) => {
    const stage = i < STAGE_A.length ? "A" : i < FILES.length ? "B" : "C";
    const reviewed = stage === "C" ? (stageCChanged.includes(name) ? "  CHANGED since review" : "  reviewed version; only with --stage C") : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${stage}  ${sha256(join(ROOT, "supabase", name)).slice(0, 12)}  ${name}${reviewed}`);
  });
  console.log("\nNo connection made. Next: --preflight (read only).");
  process.exit(0);
}
ok(`database address is maroon-auth-dev (${conn.kind}, user ${conn.user}); password not shown`);

// ===================================================================================================================
// 2. Talking to the database: psql only, password through the environment, nothing inherited from the terminal.
// ===================================================================================================================
function psql(extraArgs, input) {
  const env = { ...process.env, PGPASSWORD: conn.password, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "20", PGAPPNAME: "authdev-migrate" };
  const target = `host=${conn.host} port=${conn.port} user=${conn.user} dbname=postgres sslmode=require`;
  const run = spawnSync(PSQL, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", target, ...extraArgs], { input, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.error) return { code: 1, stdout: "", stderr: `Couldn't start psql (${run.error.code}). Install PostgreSQL's command-line tools or set AUTHDEV_PSQL.` };
  // A password should never appear in psql output, but scrub it anyway before anything is printed.
  const scrub = (text) => (text ?? "").split(conn.password).join("****");
  return { code: run.status ?? 1, stdout: scrub(run.stdout), stderr: scrub(run.stderr) };
}
/** Runs read-only SQL that returns check<TAB>value rows; returns { check: value }. */
function readChecks(sql) {
  const result = psql(["-A", "-t", "-F", "\t"], readOnly(sql));
  if (result.code !== 0) { console.log(`\nSTOPPED: the read-only query failed.\n${result.stderr.trim()}`); process.exit(1); }
  return Object.fromEntries(result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.split("\t")));
}
function ledgerRows() {
  const exists = readChecks("select 'ledger', (to_regclass('authdev_meta.applied_files') is not null)::text").ledger === "true";
  if (!exists) return [];
  const result = psql(["-A", "-t", "-F", "\t"], readOnly(STATUS_SQL));
  if (result.code !== 0) { console.log(`\nSTOPPED: couldn't read the progress record.\n${result.stderr.trim()}`); process.exit(1); }
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => { const [seq, file, hash, at] = line.split("\t"); return { seq: Number(seq), file, hash, at }; });
}
/** The record must be exactly the first N files (Stage C included), in order, each unchanged since it ran. */
function checkLedger(rows) {
  rows.forEach((row, i) => {
    if (row.seq !== i + 1 || row.file !== ALL_FILES[i]) fail(`Progress record row ${i + 1} is ${row.file}, expected ${ALL_FILES[i]}. Stopping.`);
    else if (row.hash !== sha256(join(ROOT, "supabase", row.file))) fail(`${row.file} has changed since it was applied. Stopping.`);
  });
}

// ===================================================================================================================
// 3. Modes.
// ===================================================================================================================
function printRows(rows) {
  let section = "";
  for (const [group, label, value, pass] of rows) {
    if (group !== section) { console.log(`\n${group}`); section = group; }
    console.log(`  ${pass === null ? "INFO" : pass ? "PASS" : "FAIL"}  ${label}: ${value}`);
  }
  return rows.filter((row) => row[3] === false).length;
}

/** Stage C may start only on top of exactly the 44 Stage A/B files (or resume after file 45), with nothing of it there yet. */
function stageCPreflightRows(done) {
  const c = readChecks(STAGE_C_PREFLIGHT_SQL);
  const resuming = done === FILES.length + 1;
  return [
    ["Stage C preflight", "this check ran read-only", c.transaction_read_only, c.transaction_read_only === "on"],
    ["Stage C preflight", "files recorded (44 = ready, 45 = resume)", done, done === FILES.length || resuming],
    ["Stage C preflight", "Stage C files are the reviewed versions", stageCChanged.length ? `changed: ${stageCChanged.join(", ")}` : "yes", !stageCChanged.length],
    ["Stage C preflight", "account_activation objects already present", c.activation_objects, c.activation_objects === (resuming ? "true" : "false")],
    ["Stage C preflight", "auth_code_attempts objects already present", c.auth_code_objects, c.auth_code_objects === "false"],
    ["Stage C preflight", "tables it needs (profiles, golf_trip_members, account_deletions, player_slots)", `${c.dependency_tables} of 4`, c.dependency_tables === "4"],
    ["Stage C preflight", "functions it calls (invite hash, initialize profile, name check, deletion, session check)", `${c.dependency_functions} of 5`, c.dependency_functions === "5"],
    ["Stage C preflight", "enforcement (Stage D) present", c.enforcement_present, c.enforcement_present === "false"],
    ["Stage C preflight", "maroon.activation preset on a role / database", c.activation_flag_preset, c.activation_flag_preset === "false"],
    ["Stage C preflight", "service_role exists", c.service_role, c.service_role === "true"],
    ["Stage C preflight", "sign-in accounts (each becomes Pending, never activated by this)", c.auth_users, null],
    ["Stage C preflight", "profiles", c.profiles, null],
  ];
}

function stageCVerifyRows() {
  const c = readChecks(STAGE_C_VERIFY_SQL);
  return [
    ["Stage C", "private tables present (7 activation + auth_code_attempts)", `${c.tables_present} of 8`, c.tables_present === "8"],
    ["Stage C", "row security on for all 8", `${c.tables_rls_on} of 8`, c.tables_rls_on === "8"],
    ["Stage C", "browser roles can read / write them", c.tables_browser_access, c.tables_browser_access === "(none)"],
    ["Stage C", "onboarding / code functions present", `${c.functions_present} of 11`, c.functions_present === "11"],
    ["Stage C", "browser roles can call them", c.functions_browser_exec, c.functions_browser_exec === "(none)"],
    ["Stage C", "server (service_role) can call them", `${c.functions_service_exec} of 11`, c.functions_service_exec === "11"],
    ["Stage C", "settings row", c.settings_rows, c.settings_rows === "1"],
    ["Stage C", "activated profiles", c.activated_profiles, c.activated_profiles === "0" ? true : null],
    ["Stage C", "activated_at guard trigger on profiles", c.guard_trigger, c.guard_trigger === "true"],
    ["Stage C", "private rows (birthdays, eligibility, terms, held invites, corrections, code attempts)", c.private_rows, c.private_rows === "0" ? true : null],
    ["Stage C", "account_is_active() unchanged (enforcement not mixed in)", c.account_is_active_unchanged, c.account_is_active_unchanged === "true"],
    ["Stage C", "activation switch (false until the separate dev-only step)", c.activation_enabled, c.activation_enabled === "false" ? true : null],
    ["Stage C", "legal document versions ((none) until the separate dev-only step)", c.legal_versions, c.legal_versions === "(none)" ? true : null],
    ["Not approved", "enforcement (Stage D) present", c.enforcement_present, c.enforcement_present === "false"],
  ];
}

if (MODE === "preflight" && STAGE_C_RUN) {
  const rows = ledgerRows();
  checkLedger(rows);
  stopIfProblems("PROGRESS RECORD PROBLEMS");
  const failed = printRows(stageCPreflightRows(rows.length));
  console.log(failed ? `\nStage C preflight: ${failed} item(s) need attention (nothing was changed).` : "\nStage C preflight passed (read only, nothing was changed).");
  process.exit(failed ? 1 : 0);
}

if (MODE === "preflight") {
  const c = readChecks(PREFLIGHT_SQL);
  const rows = [
    ["Identity", "connected to project", DEV_REF, true],
    ["Identity", "database / login", `${c.database} / ${c.login_role}`, c.database === "postgres" && c.login_role === "postgres"],
    ["Identity", "Postgres version", c.server_version_num, Number(c.server_version_num) >= 150000],
    ["Identity", "Supabase schemas (auth, storage, realtime, extensions, graphql_public)", c.supabase_schemas, c.supabase_schemas === "5"],
    ["Identity", "this check ran read-only", c.transaction_read_only, c.transaction_read_only === "on"],
    ["Empty", "public tables / views", c.public_tables, c.public_tables === "0"],
    ["Empty", "public functions", c.public_functions, c.public_functions === "0"],
    ["Empty", "sign-in accounts (auth.users)", c.auth_users, c.auth_users === "0"],
    ["Empty", "storage buckets", c.storage_buckets, c.storage_buckets === "0"],
    ["Empty", "realtime publication tables", c.realtime_publication_tables, c.realtime_publication_tables === "0"],
    ["Empty", "progress record already exists", c.ledger_schema_exists, c.ledger_schema_exists === "false"],
    ["Empty", "activation / code-attempt tables present", c.blocked_objects_present, c.blocked_objects_present === "false"],
    ["Extensions", "installed", c.extensions_installed, true],
    ["Extensions", "pg_cron installed (would schedule a job every minute)", c.pg_cron_installed, c.pg_cron_installed === "false"],
    ["Privileges", "superuser (expected false on hosted)", c.is_superuser, true],
    ["Privileges", "can create in public", c.can_create_in_public, c.can_create_in_public === "true"],
    ["Privileges", "auth.users: REFERENCES (foreign keys)", c.auth_users_references, c.auth_users_references === "true"],
    ["Privileges", "auth.users: TRIGGER (player_slots_password_created)", c.auth_users_trigger, c.auth_users_trigger === "true"],
    ["Privileges", "storage.buckets: INSERT", c.storage_buckets_insert, c.storage_buckets_insert === "true"],
    ["Privileges", "storage.buckets has size / type columns (profile_photos)", c.storage_buckets_has_limit_columns, c.storage_buckets_has_limit_columns === "true"],
    ["Privileges", `policy on storage.objects (owner ${c.storage_objects_owner}, or via supabase_privileged_role)`, c.can_policy_storage_objects, c.can_policy_storage_objects === "true"],
    ["Privileges", `alter realtime publication (owner ${c.realtime_publication_owner})`, c.can_alter_realtime_publication, c.can_alter_realtime_publication === "true"],
    ["Privileges", "authenticator role exists", c.authenticator_exists, c.authenticator_exists === "true"],
    ["Privileges", "authenticator current settings", c.authenticator_settings, !/db_pre_request/.test(c.authenticator_settings ?? "")],
    ["Privileges", "can set authenticator's pre-request hook (account_deletion)", c.can_alter_authenticator, c.can_alter_authenticator === "true"],
    ["Compatibility", "auth.uid() (the only auth helper the files call)", c.auth_uid, c.auth_uid === "true"],
    ["Compatibility", "gen_random_uuid()", c.gen_random_uuid, c.gen_random_uuid === "true"],
    ["Compatibility", "anon / authenticated / service_role roles", c.api_roles, c.api_roles === "true"],
  ];
  let section = "";
  for (const [group, label, value, pass] of rows) {
    if (group !== section) { console.log(`\n${group}`); section = group; }
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}: ${value}`);
  }
  const failed = rows.filter((row) => !row[3]).length;
  console.log(failed ? `\nPreflight: ${failed} item(s) need attention (nothing was changed).` : "\nPreflight passed (read only, nothing was changed).");
  process.exit(failed ? 1 : 0);
}

if (MODE === "status") {
  const rows = ledgerRows();
  checkLedger(rows);
  console.log(`\n${rows.length} of ${ALL_FILES.length} files recorded as applied (Stage A/B: 44, Stage C: 2).`);
  rows.forEach((row) => console.log(`  ${String(row.seq).padStart(2)}. ${row.file}  ${row.at}`));
  if (rows.length < ALL_FILES.length) console.log(`Next: ${rows.length + 1}. ${ALL_FILES[rows.length]}${rows.length >= FILES.length ? " (needs --stage C)" : ""}`);
  stopIfProblems("PROGRESS RECORD PROBLEMS");
  process.exit(0);
}

if (MODE === "verify") {
  const recorded = ledgerRows();
  checkLedger(recorded);
  stopIfProblems("PROGRESS RECORD PROBLEMS");
  // Before Stage C its objects must be absent; once files 45-46 are recorded they must be present (and checked below).
  const stageC = recorded.length === ALL_FILES.length;
  const c = readChecks(VERIFY_SQL);
  const stageA = "account_deletion_state,account_is_active,complete_my_profile,initialize_my_profile,reject_deleted_accounts,session_is_revoked";
  const expectC = stageC ? "true" : "false";
  const cGroup = stageC ? "Stage C installed" : "Not approved";
  const rows = [
    ["Progress", "files recorded as applied (44 = A/B, 46 = with Stage C)", c.ledger_files, c.ledger_files === "44" || c.ledger_files === "46"],
    ["Stage A", "profiles rows (0 until someone signs up)", c.profiles_rows, true],
    ["Stage A", "player_slots seeded", c.player_slots_rows, c.player_slots_rows === "13"],
    ["Stage A", "sign-in / profile / deletion functions", c.stageA_functions, c.stageA_functions === stageA],
    ["Stage A", "authenticator pre-request hook", c.pre_request_hook, /pgrst\.db_pre_request=public\.reject_deleted_accounts/.test(c.pre_request_hook ?? "")],
    ["Stage A", "active_account_only policies (public + storage)", c.restrictive_policies, Number(c.restrictive_policies) > 0],
    ["Stage A", "active_account_only on storage.objects", c.storage_objects_policy, c.storage_objects_policy === "true"],
    ["Stage A", "password-created trigger on auth.users", c.auth_users_trigger, c.auth_users_trigger === "true"],
    ["Stage A", "storage buckets", c.buckets, c.buckets === "profile-photos,shot-videos"],
    ["Stage A", "public tables without row security (review)", c.public_tables_without_rls, true],
    ["Stage A", "pg_cron present (should be false)", c.cron_job_scheduled, c.cron_job_scheduled === "false"],
    ["Stage B", "friends / history functions", c.stageB_functions, c.stageB_functions === "get_profile_history,my_friend_requests,search_golfers"],
    [cGroup, "activation tables", c.activation_tables, c.activation_tables === expectC],
    [cGroup, "profiles.activated_at column", c.activated_at_column, c.activated_at_column === expectC],
    [cGroup, "auth_code_attempts table", c.auth_code_attempts, c.auth_code_attempts === expectC],
    ["Not approved", "enforcement functions / triggers", c.enforcement_objects, c.enforcement_objects === "false"],
    ["Not approved", "enforcement renames (*_all)", c.enforcement_renames, c.enforcement_renames === "false"],
    ...(stageC ? stageCVerifyRows() : []),
  ];
  if (recorded.length === FILES.length + 1) rows.push(["Stage C", "both Stage C files recorded", "only file 45; resume with --apply --stage C", false]);
  const failed = printRows(rows);
  console.log(failed ? `\nVerify: ${failed} item(s) failed.` : "\nVerify passed (read only).");
  process.exit(failed ? 1 : 0);
}

// --apply
if (valueOf("--confirm") !== DEV_REF) fail(`--apply also needs: --confirm ${DEV_REF}`);
if (STAGE_C_RUN && valueOf("--through") !== undefined) fail("--through isn't used with --stage C (it always means files 45-46).");
const through = STAGE_C_RUN ? ALL_FILES.length : valueOf("--through") === undefined ? FILES.length : Number(valueOf("--through"));
if (!STAGE_C_RUN && (!Number.isInteger(through) || through < 1 || through > FILES.length)) fail(`--through must be a number from 1 to ${FILES.length}.`);
stopIfProblems("NOT APPLIED");

const done = ledgerRows();
checkLedger(done);
stopIfProblems("NOT APPLIED");
if (STAGE_C_RUN) {
  if (done.length === ALL_FILES.length) { console.log(`\nNothing to do: files 1-${done.length} are already applied.`); process.exit(0); }
  // Stage C goes on top of exactly the 44 verified files (or resumes after file 45), only if its own preflight passes.
  const failed = printRows(stageCPreflightRows(done.length));
  if (failed) { console.log(`\nNOT APPLIED: Stage C preflight has ${failed} item(s) that need attention.`); process.exit(1); }
} else if (!done.length) {
  // First run: the database must be the untouched, empty project the preflight saw.
  const c = readChecks(PREFLIGHT_SQL);
  if (c.public_tables !== "0" || c.public_functions !== "0") fail(`This database already has ${c.public_tables} public tables / ${c.public_functions} functions but no progress record. Stopping.`);
  if (Number(c.auth_users) > 0) fail(`This database already has ${c.auth_users} sign-in accounts. Expected a brand-new project. Stopping.`);
  if (c.supabase_schemas !== "5") fail("This doesn't look like a Supabase database. Stopping.");
  stopIfProblems("NOT APPLIED");
  const ledger = psql([], LEDGER_SQL);
  if (ledger.code !== 0) { console.log(`\nSTOPPED: couldn't create the progress record.\n${ledger.stderr.trim()}`); process.exit(1); }
  ok("progress record created (authdev_meta.applied_files)");
}

if (done.length >= through) { console.log(`\nNothing to do: files 1-${done.length} are already applied.`); process.exit(0); }
console.log(`\nApplying files ${done.length + 1}-${through} of ${ALL_FILES.length}. Stops at the first error.\n`);
for (let i = done.length; i < through; i++) {
  const name = ALL_FILES[i], file = join(ROOT, "supabase", name), hash = sha256(file);
  const started = Date.now();
  process.stdout.write(`  ${String(i + 1).padStart(2)}. ${name} ... `);
  const run = psql(["-f", file]);
  if (run.code !== 0) {
    console.log("FAILED");
    console.log(`\nSTOPPED at file ${i + 1} (${name}). Nothing after it ran. Files 1-${i} stay recorded as applied.`);
    console.log("Files with their own begin/commit were rolled back; in the others, statements before the error stay in place.");
    console.log("Every file here is written to be safe to re-run. Send the error below (it contains no keys) before retrying.\n");
    console.log(run.stderr.trim());
    process.exit(1);
  }
  const record = psql([], `insert into authdev_meta.applied_files (seq, file, sha256) values (${i + 1}, '${name}', '${hash}');`);
  if (record.code !== 0) {
    console.log("APPLIED, BUT NOT RECORDED");
    console.log(`\nSTOPPED: ${name} ran, but its progress row couldn't be written.\n${record.stderr.trim()}`);
    process.exit(1);
  }
  console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
console.log(`\nDone: files 1-${through} applied and recorded. Next: node authdev-migrate.mjs --verify`);
