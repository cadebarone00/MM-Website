// OFFLINE verification of one backup folder (docs/account-retirement-architecture-2026-10-30.md, step B3).
//   node scripts/legacy-local/verify-backup.mjs <backup folder>
// Checks, without any network or database: the database manifest says success and database.dump matches its SHA-256;
// pg_restore can read the dump's table of contents (and which Postgres version made it); every Storage file in
// storage-manifest.json exists with the recorded size and SHA-256. Changes nothing; prints counts only.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Returns { problems, summary } for one backup folder. Used by restore-local.mjs before anything is restored. */
export async function verifyBackup(folder, pgRestore = "pg_restore") {
  const problems = [];
  const summary = {};
  const manifestPath = join(folder, "manifest.json");
  if (!existsSync(manifestPath)) return { problems: ["manifest.json is missing"], summary };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  summary.backupId = manifest.backupId;
  summary.timestamp = manifest.timestamp;
  if (manifest.state !== "success") problems.push(`database manifest state is "${manifest.state}", not "success"`);
  const dump = manifest.files?.find((f) => f.name === "database.dump");
  const dumpPath = join(folder, "database.dump");
  if (!dump || !existsSync(dumpPath)) problems.push("database.dump is missing");
  else {
    if (statSync(dumpPath).size !== dump.bytes) problems.push("database.dump size differs from the manifest");
    if ((await sha256File(dumpPath)) !== dump.sha256) problems.push("database.dump checksum differs from the manifest");
    const list = spawnSync(pgRestore, ["--list", dumpPath], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (list.status !== 0) problems.push("pg_restore cannot read database.dump");
    else {
      summary.dumpedFrom = (list.stdout.match(/Dumped from database version: (.+)/) ?? [])[1]?.trim() ?? "unknown";
      const entries = list.stdout.split(/\r?\n/).filter((line) => /^\d+;/.test(line));
      const has = (type, schema, name) => entries.some((line) => line.includes(` ${type} ${schema} ${name} `));
      summary.tocEntries = entries.length;
      summary.publicTables = entries.filter((line) => / TABLE public /.test(line)).length;
      summary.hasAuthUsersData = has("TABLE DATA", "auth", "users");
      summary.hasStorageObjectsData = has("TABLE DATA", "storage", "objects");
      if (!summary.hasAuthUsersData) problems.push("the dump has no auth.users data (logins would be missing)");
    }
  }
  const storagePath = join(folder, "storage-manifest.json");
  if (!existsSync(storagePath)) summary.storage = "no storage-manifest.json (Storage files not backed up)";
  else {
    const storage = JSON.parse(readFileSync(storagePath, "utf8"));
    if (storage.state !== "success") problems.push(`storage manifest state is "${storage.state}", not "success"`);
    let checked = 0;
    for (const file of storage.files ?? []) {
      const path = join(folder, "storage", file.bucket, ...file.name.split("/"));
      if (!existsSync(path)) { problems.push(`missing Storage file in ${file.bucket}`); continue; }
      if (statSync(path).size !== file.bytes || (await sha256File(path)) !== file.sha256) problems.push(`Storage file changed in ${file.bucket}`);
      checked++;
    }
    summary.storage = Object.fromEntries((storage.buckets ?? []).map((b) => [b.id, (storage.files ?? []).filter((f) => f.bucket === b.id).length]));
    summary.storageFilesChecked = checked;
  }
  return { problems, summary };
}

// Run directly (not when restore-local.mjs imports verifyBackup).
if (process.argv[1]?.endsWith("verify-backup.mjs")) {
  const folder = process.argv[2];
  if (!folder) { console.error("Usage: node scripts/legacy-local/verify-backup.mjs <backup folder>"); process.exit(1); }
  const { problems, summary } = await verifyBackup(folder, process.env.PG_RESTORE ?? "pg_restore");
  console.log(JSON.stringify(summary, null, 2));
  if (problems.length) { console.error(`BACKUP NOT VERIFIED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
  console.log("BACKUP VERIFIED: checksums match and the dump is readable.");
}
