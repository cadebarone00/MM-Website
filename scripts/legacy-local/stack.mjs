// The LOCAL legacy-testing Supabase stack "maroon-legacy" (docs/account-retirement-architecture-2026-10-30.md).
//   node scripts/legacy-local/stack.mjs                                  check only: Docker, free ports, no changes
//   node scripts/legacy-local/stack.mjs start   --confirm maroon-legacy  build out/legacy-local and start an EMPTY stack
//   node scripts/legacy-local/stack.mjs status                           what is running (local addresses only)
//   node scripts/legacy-local/stack.mjs stop                             stop it, KEEPING its data
//   node scripts/legacy-local/stack.mjs destroy --confirm maroon-legacy  stop it and DELETE its data (cleanup, step L9)
// Project "maroon-legacy", ports 57xxx, workdir out/legacy-local: never the main stack (54xxx), maroon-auth-test (55xxx),
// maroon-auth-main (56xxx), maroon-auth-dev or production. It applies NO migrations: the only way data gets in is
// restore-local.mjs from a verified backup. It never reads .env files and never touches backups.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { LEGACY, confirmed } from "./guard.mjs";

const root = process.cwd();
const work = join(root, LEGACY.workdir);
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "check";
const supabase = (...rest) => execFileSync("npx", ["--no-install", "supabase", ...rest, "--workdir", work], { stdio: "inherit", shell: true });
const PORTS = [57320, 57321, 57322, 57323, 57324];

const portFree = (port) => new Promise((done) => {
  const server = createServer().once("error", () => done(false)).once("listening", () => server.close(() => done(true)));
  server.listen(port, "127.0.0.1");
});
const containers = () => {
  const out = spawnSync("docker", ["ps", "-a", "--filter", `name=_${LEGACY.project}`, "--format", "{{.Names}}\t{{.Status}}"], { encoding: "utf8" });
  if (out.status !== 0) throw new Error("Docker is not available. Start Docker Desktop first.");
  return out.stdout.trim().split("\n").filter(Boolean);
};

if (!existsSync(join(root, "scripts", "legacy-local", "config.toml"))) {
  console.error("Run this from the repository folder (scripts/legacy-local/config.toml not found).");
  process.exit(1);
}

if (command === "check") {
  const existing = containers();
  console.log(`Project ${LEGACY.project}, workdir ${LEGACY.workdir}, API ${LEGACY.api}, database container ${LEGACY.dbContainer}`);
  console.log(existing.length ? `Existing containers:\n  ${existing.join("\n  ")}` : "No maroon-legacy containers exist yet.");
  for (const port of PORTS) console.log(`  port ${port}: ${(await portFree(port)) ? "free" : "IN USE"}`);
  console.log("Nothing was started or changed. To start an empty stack: node scripts/legacy-local/stack.mjs start --confirm maroon-legacy");
} else if (command === "start") {
  if (!confirmed(args)) { console.error("Type --confirm maroon-legacy to start the legacy stack."); process.exit(1); }
  if (containers().length === 0) {
    const busy = [];
    for (const port of PORTS) if (!(await portFree(port))) busy.push(port);
    if (busy.length) { console.error(`Ports in use: ${busy.join(", ")}. Nothing was started.`); process.exit(1); }
  }
  mkdirSync(join(work, "supabase", "migrations"), { recursive: true });
  cpSync(join(root, "scripts", "legacy-local", "config.toml"), join(work, "supabase", "config.toml"));
  // Only what the legacy copy needs: database, Auth, REST, gateway, Storage, Studio, Mailpit. No Realtime, no Edge
  // Functions, no analytics, no connection pooler.
  supabase("start", "-x", "realtime,imgproxy,edge-runtime,logflare,vector,supavisor");
  supabase("status");
} else if (command === "status") {
  supabase("status");
} else if (command === "stop") {
  supabase("stop");
} else if (command === "destroy") {
  if (!confirmed(args)) { console.error("Type --confirm maroon-legacy to DELETE the legacy copy's data. Backups are not touched."); process.exit(1); }
  try { supabase("stop", "--no-backup"); } catch { /* not running */ }
  rmSync(work, { recursive: true, force: true });
  const left = containers();
  if (left.length) { console.error(`Containers still present:\n  ${left.join("\n  ")}`); process.exit(1); }
  console.log("Legacy copy deleted (containers, data volumes and out/legacy-local). Backups were not touched.");
} else {
  console.error(`Unknown command "${command}". Use: check | start | status | stop | destroy`);
  process.exit(1);
}
