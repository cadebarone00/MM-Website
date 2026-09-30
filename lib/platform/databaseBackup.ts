import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface BackupManifest {
  version: 1;
  backupId: string;
  timestamp: string;
  environment: "production";
  databaseIdentifier: string;
  gitCommit: string | null;
  method: "pg_dump-custom";
  state: "running" | "success" | "failed";
  files: { name: string; bytes: number; sha256: string }[];
  rowCounts: Record<string, number> | null;
}

export function validateManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as BackupManifest;
  return m.version === 1 && /^[a-zA-Z0-9-]+$/.test(m.backupId ?? "") &&
    typeof m.timestamp === "string" && Number.isFinite(Date.parse(m.timestamp)) &&
    m.environment === "production" && /^sha256:[a-f0-9]{64}$/.test(m.databaseIdentifier ?? "") &&
    (m.gitCommit === null || /^[a-f0-9]{40,64}$/.test(m.gitCommit)) &&
    m.method === "pg_dump-custom" && ["running", "success", "failed"].includes(m.state) &&
    Array.isArray(m.files) && m.files.every(f => f && f.name === "database.dump" && Number.isSafeInteger(f.bytes) && f.bytes > 0 && /^[a-f0-9]{64}$/.test(f.sha256)) &&
    m.files.length <= 1 && (m.state !== "success" || m.files.length === 1) &&
    (m.rowCounts === null || (typeof m.rowCounts === "object" && !Array.isArray(m.rowCounts) && Object.values(m.rowCounts).every(n => Number.isSafeInteger(n) && n >= 0)));
}

export async function checksum(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Never forward arbitrary connection options or credentials in process arguments. */
export function connectionEnvironment(connection: string | undefined): NodeJS.ProcessEnv {
  if (!connection) throw new Error("Set PRODUCTION_DATABASE_URL explicitly; no .env file is loaded.");
  try {
    const url = new URL(connection);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2 || url.hash) throw new Error();
    for (const key of url.searchParams.keys()) if (key !== "sslmode") throw new Error();
    const ssl = url.searchParams.get("sslmode") ?? "require";
    if (!["require", "verify-ca", "verify-full"].includes(ssl)) throw new Error();
    return { PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: ssl, PGCONNECT_TIMEOUT: "15" };
  } catch { throw new Error("Invalid PRODUCTION_DATABASE_URL; use a PostgreSQL URI with credentials and TLS. Only sslmode is supported."); }
}

export type Runner = (command: string, args: string[], env: NodeJS.ProcessEnv) => { status: number | null; stdout?: string };
const run: Runner = (command, args, env) => {
  const result = spawnSync(command, args, { env, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  return { status: result.status, stdout: result.stdout ?? "" };
};

export async function backupDatabase(options: { connection?: string; root?: string; now?: Date; runner?: Runner } = {}): Promise<string> {
  const pg = connectionEnvironment(options.connection);
  const runner = options.runner ?? run;
  const env: NodeJS.ProcessEnv = {};
  // Exclude inherited PGOPTIONS, service files and application secrets.
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"]) if (process.env[key]) env[key] = process.env[key];
  if (runner("pg_dump", ["--version"], env).status !== 0) throw new Error("pg_dump unavailable. Install PostgreSQL client tools compatible with the server and add them to PATH.");
  const timestamp = (options.now ?? new Date()).toISOString();
  const backupId = `${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}`;
  const folder = join(options.root ?? join("out", "backups", "database"), backupId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const git = runner("git", ["rev-parse", "HEAD"], env);
  const commit = git.stdout?.trim() ?? "";
  const manifest: BackupManifest = { version: 1, backupId, timestamp, environment: "production", databaseIdentifier: `sha256:${createHash("sha256").update(`${pg.PGHOST}:${pg.PGPORT}/${pg.PGDATABASE}`).digest("hex")}`, gitCommit: git.status === 0 && /^[a-f0-9]{40,64}$/.test(commit) ? commit : null, method: "pg_dump-custom", state: "running", files: [], rowCounts: null };
  const save = () => writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await save();
  try {
    const path = join(folder, "database.dump");
    const result = runner("pg_dump", ["--format=custom", "--no-password", "--file", path], { ...env, ...pg });
    if (result.status !== 0) throw new Error();
    manifest.files = [{ name: "database.dump", bytes: (await stat(path)).size, sha256: await checksum(path) }];
    manifest.state = "success";
    if (!validateManifest(manifest)) throw new Error();
    await save();
    return folder;
  } catch {
    manifest.state = "failed";
    await save();
    throw new Error("Database backup failed. Partial files are not recoverable backups; inspect the manifest. Child diagnostics are suppressed to protect secrets.");
  }
}
