// READ-ONLY backup of production Storage files (docs/account-retirement-architecture-2026-10-30.md, step B2).
// The database dump does not contain uploaded files; this downloads them next to it, with a checksum for every file.
//
//   MAROON_BACKUP_DIR=D:\MaroonBackups  PRODUCTION_SUPABASE_URL=https://msvrbifhdvltibafzrdb.supabase.co
//   PRODUCTION_SUPABASE_SERVICE_ROLE_KEY=<typed into this terminal only>
//   node scripts/legacy-local/backup-storage.mjs --into <database backup folder> [--buckets profile-photos,shot-videos]
//
// It only LISTS and DOWNLOADS (GET / list requests); it never uploads, moves or deletes anything in production. The key
// is read from the environment, never printed, never written to disk. Files go to <backup>/storage/<bucket>/<path>, and
// <backup>/storage-manifest.json records bucket settings and every file's size and SHA-256. Nothing is overwritten:
// it refuses if <backup>/storage already exists.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FORBIDDEN_REFS, isInside, safeBackupDir } from "./guard.mjs";

const args = process.argv.slice(2);
const valueOf = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined; };
const fail = (message) => { console.error(`STORAGE BACKUP NOT COMPLETE. ${message}`); process.exit(1); };

const PRODUCTION_REF = Object.keys(FORBIDDEN_REFS).find((ref) => FORBIDDEN_REFS[ref] === "production");
const base = (process.env.PRODUCTION_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY ?? "";
if (base !== `https://${PRODUCTION_REF}.supabase.co`) fail(`PRODUCTION_SUPABASE_URL must be https://${PRODUCTION_REF}.supabase.co.`);
if (!key) fail("Set PRODUCTION_SUPABASE_SERVICE_ROLE_KEY in this terminal (it is never printed or saved).");

let backupRoot, into;
try { backupRoot = safeBackupDir(process.env.MAROON_BACKUP_DIR); } catch (error) { fail(error.message); }
into = valueOf("--into") ? resolve(valueOf("--into")) : undefined;
if (!into || !isInside(into, backupRoot) || !existsSync(join(into, "manifest.json"))) {
  fail("--into must be a database backup folder (with manifest.json) inside MAROON_BACKUP_DIR, so files and database stay together.");
}
const out = join(into, "storage");
if (existsSync(out)) fail(`${out} already exists. Existing backups are never overwritten; use a new database backup folder.`);
const only = valueOf("--buckets")?.split(",").map((b) => b.trim()).filter(Boolean);

const headers = { Authorization: `Bearer ${key}`, apikey: key };
async function api(path, init = {}) {
  const response = await fetch(`${base}/storage/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Storage answered ${response.status} for ${init.method ?? "GET"} ${path.split("/")[0]}`);
  return response;
}

// Every file in a bucket, walking folders. The list call is a POST only because it takes a JSON body; it reads.
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await api(`object/list/${encodeURIComponent(bucket)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    })).json();
    for (const entry of page) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...await listAll(bucket, path)); // a folder
      else files.push({ name: path, contentType: entry.metadata?.mimetype ?? null });
    }
    if (page.length < 1000) return files;
  }
}

const manifest = { version: 1, project: PRODUCTION_REF, startedAt: new Date().toISOString(), state: "running", buckets: [], files: [] };
const save = () => writeFileSync(join(into, "storage-manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
mkdirSync(out, { recursive: true, mode: 0o700 });
save();
try {
  const buckets = await (await api("bucket")).json();
  for (const bucket of buckets) {
    if (only && !only.includes(bucket.id)) continue;
    manifest.buckets.push({ id: bucket.id, public: bucket.public, fileSizeLimit: bucket.file_size_limit ?? null, allowedMimeTypes: bucket.allowed_mime_types ?? null });
    for (const file of await listAll(bucket.id)) {
      const bytes = Buffer.from(await (await api(`object/authenticated/${encodeURIComponent(bucket.id)}/${file.name.split("/").map(encodeURIComponent).join("/")}`)).arrayBuffer());
      const target = join(out, bucket.id, ...file.name.split("/"));
      if (!isInside(target, out)) throw new Error("A file name tried to leave the backup folder.");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { mode: 0o600 });
      manifest.files.push({ bucket: bucket.id, name: file.name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: file.contentType });
    }
  }
  if (only) for (const wanted of only) if (!manifest.buckets.some((b) => b.id === wanted)) throw new Error(`Bucket "${wanted}" does not exist.`);
  manifest.state = "success";
  manifest.finishedAt = new Date().toISOString();
  save();
  console.log(`Storage backup complete: ${manifest.files.length} files in ${manifest.buckets.length} buckets (${manifest.buckets.map((b) => `${b.id}: ${manifest.files.filter((f) => f.bucket === b.id).length}`).join(", ")}).`);
} catch (error) {
  manifest.state = "failed";
  save();
  fail(`${error.message}. The partial folder is NOT a usable backup; keep it for inspection, then start a new backup.`);
}
