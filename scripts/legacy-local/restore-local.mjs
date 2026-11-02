// Restores a VERIFIED production backup into the EMPTY local maroon-legacy stack (architecture doc, step L2).
//   node scripts/legacy-local/restore-local.mjs <backup folder> --confirm maroon-legacy [--expected <counts.json>]
//
// Order: verify checksums (verify-backup.mjs) -> the target must be the running, EMPTY maroon-legacy container -> restore
// in ONE transaction (all or nothing) -> counts compared with the approved Phase 0 numbers -> Storage files uploaded to
// the LOCAL Storage service and checked by checksum -> marked "raw" in legacy_meta.restore_log. The copy is then
// unusable by the app (start-app.mjs refuses) until sanitize.mjs has run.
//
// What is restored from the dump (restoreList): the whole public schema (tables, data, functions, triggers, policies,
// grants), and ONLY two login tables' rows: auth.users and auth.identities. Sessions, refresh tokens, one-time codes,
// MFA, half-finished OAuth sign-ins and the sign-in log are never restored. Nothing from cron, net (webhooks),
// supabase_functions, realtime, vault, storage metadata or extensions comes across. Storage files are uploaded from the
// Storage backup through the local API instead.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { LEGACY, confirmed } from "./guard.mjs";
import { legacyKeys, psqlLegacy, requireLegacyContainer } from "./local.mjs";
import { sha256File, verifyBackup } from "./verify-backup.mjs";

const MULTI_WORD_TYPES = ["TABLE DATA", "FK CONSTRAINT", "SEQUENCE SET", "SEQUENCE OWNED BY", "DEFAULT ACL", "PUBLICATION TABLE",
  "MATERIALIZED VIEW", "MATERIALIZED VIEW DATA", "EVENT TRIGGER", "ROW SECURITY", "POLICY", "TEXT SEARCH CONFIGURATION", "TEXT SEARCH DICTIONARY"];
const AUTH_DATA = new Set(["users", "identities"]);

/**
 * pg_restore --list lines -> only the lines to restore (see the header), in the order to restore them. Pure; unit tested
 * in restore-list.test.mjs. pg_restore follows this order. The login rows come FIRST, users before identities: the
 * local stack's own auth tables already have their foreign keys, and --disable-triggers only works for data-only
 * restores (found by the local dump test, 2026-10-30). Public tables' foreign keys are created after all data anyway.
 */
export function restoreList(tocText) {
  const login = [], rest = [];
  for (const line of tocText.split(/\r?\n/)) {
    if (!/^\d+;/.test(line)) continue;
    const body = line.replace(/^\d+; \d+ \d+ /, "");
    const type = [...MULTI_WORD_TYPES].sort((a, b) => b.length - a.length).find((t) => body.startsWith(`${t} `)) ?? body.split(" ")[0];
    const [schema, name] = body.slice(type.length + 1).split(" ");
    if (schema === "public" && !["SCHEMA", "EXTENSION", "PUBLICATION TABLE", "EVENT TRIGGER"].includes(type)) rest.push(line);
    else if (type === "TABLE DATA" && schema === "auth" && AUTH_DATA.has(name)) login[name === "users" ? "unshift" : "push"](line);
  }
  return [...login, ...rest].join("\n") + "\n";
}

const KEY_COUNTS = `
select 'auth.users', count(*) from auth.users
union all select 'auth.identities', count(*) from auth.identities
union all select 'profiles', count(*) from public.profiles
union all select t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::bigint
  from unnest(array['player_rounds', 'golf_trips', 'shared_rounds', 'player_slots', 'tournament_editions', 'archived_scorecard_rounds', 'career_archive_rounds',
    'tournament_players', 'code_tournaments']) t where to_regclass('public.' || t) is not null;`;

async function main() {
  const args = process.argv.slice(2);
  const folder = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
  if (!folder) throw new Error("Usage: node scripts/legacy-local/restore-local.mjs <backup folder> --confirm maroon-legacy [--expected counts.json]");
  if (!confirmed(args)) throw new Error("Type --confirm maroon-legacy to restore into the local legacy copy.");
  const expectedAt = args.indexOf("--expected");
  const expected = expectedAt >= 0 ? JSON.parse(readFileSync(args[expectedAt + 1], "utf8")) : null;

  // 1. The backup must verify before anything is copied anywhere.
  const { problems, summary } = await verifyBackup(folder);
  if (problems.length) throw new Error(`Backup not verified, nothing restored:\n  - ${problems.join("\n  - ")}`);
  console.log(`Backup verified: ${summary.backupId} (Postgres ${summary.dumpedFrom}).`);

  // 2. Only the running, EMPTY maroon-legacy container.
  requireLegacyContainer();
  const [tables, users] = psqlLegacy("select (select count(*) from pg_tables where schemaname = 'public'), (select count(*) from auth.users);").trim().split("\t").map(Number);
  if (tables !== 0 || users !== 0) throw new Error(`${LEGACY.project} is not empty (${tables} public tables, ${users} logins). To restore again: stack.mjs destroy, then start.`);

  // 3. Restore in one transaction, as the local superuser (needed to load linked tables in any order).
  const dump = join(folder, "database.dump");
  const toc = spawnSync("pg_restore", ["--list", dump], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (toc.status !== 0) throw new Error("pg_restore could not list the dump.");
  const container = LEGACY.dbContainer;
  const sh = (...cmd) => { const r = spawnSync("docker", cmd, { encoding: "utf8", input: cmd.includes("-i") ? restoreList(toc.stdout) : undefined }); if (r.status !== 0) throw new Error((r.stderr || "").trim().split("\n").slice(-5).join(" | ")); return r.stdout; };
  sh("exec", container, "mkdir", "-p", "/tmp/legacy-restore");
  sh("cp", dump, `${container}:/tmp/legacy-restore/database.dump`);
  sh("exec", "-i", container, "sh", "-c", "cat > /tmp/legacy-restore/restore.list");
  try {
    sh("exec", container, "pg_restore", "-U", "supabase_admin", "-d", "postgres", "--use-list=/tmp/legacy-restore/restore.list",
      "--no-owner", "--exit-on-error", "--single-transaction", "--disable-triggers", "/tmp/legacy-restore/database.dump");
  } finally {
    spawnSync("docker", ["exec", container, "rm", "-rf", "/tmp/legacy-restore"]);
  }
  psqlLegacy(`create schema if not exists legacy_meta; revoke all on schema legacy_meta from public, anon, authenticated;
    create table if not exists legacy_meta.restore_log (backup_id text not null, dump_sha256 text not null, restored_at timestamptz not null default now(), state text not null check (state in ('raw', 'sanitized')));
    insert into legacy_meta.restore_log (backup_id, dump_sha256, state) values (:'backup_id', :'dump_sha', 'raw');`,
  { vars: { backup_id: summary.backupId, dump_sha: await sha256File(dump) } });

  // 4. Counts (numbers only), compared with the approved Phase 0 numbers when given.
  const counts = Object.fromEntries(psqlLegacy(KEY_COUNTS).trim().split("\n").map((line) => line.split("\t")).map(([k, v]) => [k, Number(v)]));
  console.log("Restored counts:", JSON.stringify(counts));
  const mismatches = expected ? Object.entries(expected).filter(([k, v]) => typeof v === "number" && counts[k] !== v).map(([k, v]) => `${k}: expected ${v}, restored ${counts[k]}`) : [];

  // 5. Storage: buckets and files into the LOCAL Storage service, each file re-downloaded and checked.
  const storageManifest = join(folder, "storage-manifest.json");
  if (existsSync(storageManifest)) {
    const storage = JSON.parse(readFileSync(storageManifest, "utf8"));
    const { api, serviceKey } = legacyKeys();
    const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
    for (const b of storage.buckets) {
      const r = await fetch(`${api}/storage/v1/bucket`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, name: b.id, public: b.public, file_size_limit: b.fileSizeLimit, allowed_mime_types: b.allowedMimeTypes }) });
      if (!r.ok && r.status !== 409) throw new Error(`Local bucket ${b.id} could not be created (${r.status}).`);
    }
    let uploaded = 0;
    for (const file of storage.files) {
      const objectPath = `${encodeURIComponent(file.bucket)}/${file.name.split("/").map(encodeURIComponent).join("/")}`;
      const bytes = readFileSync(join(folder, "storage", file.bucket, ...file.name.split("/")));
      const up = await fetch(`${api}/storage/v1/object/${objectPath}`, { method: "POST", headers: { ...headers, "Content-Type": file.contentType ?? "application/octet-stream", "x-upsert": "false" }, body: bytes });
      if (!up.ok) throw new Error(`Upload failed for a file in ${file.bucket} (${up.status}).`);
      const back = Buffer.from(await (await fetch(`${api}/storage/v1/object/authenticated/${objectPath}`, { headers })).arrayBuffer());
      const { createHash } = await import("node:crypto");
      if (createHash("sha256").update(back).digest("hex") !== file.sha256) throw new Error(`Checksum differs after upload in ${file.bucket}.`);
      uploaded++;
    }
    console.log(`Storage restored locally: ${uploaded} files in ${storage.buckets.length} buckets, every checksum matched.`);
  } else {
    console.log("No storage-manifest.json in this backup: no files restored.");
  }

  if (mismatches.length) throw new Error(`Restored, but counts differ from the approved numbers:\n  - ${mismatches.join("\n  - ")}\nInvestigate before sanitizing.`);
  console.log(`Restore complete. State: RAW (real personal data). Next: node scripts/legacy-local/sanitize.mjs --confirm ${LEGACY.project}`);
}

if (process.argv[1]?.endsWith("restore-local.mjs")) {
  main().catch((error) => { console.error(`RESTORE STOPPED. ${error.message}`); process.exit(1); });
}
