// The ONLY ways scripts/legacy-local/* reach a database or API: the local maroon-legacy Docker container and its local
// API. There is no connection-string option anywhere, so these scripts cannot be pointed at a hosted project.
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { LEGACY, hostedTargetProblems, legacyApiProblems } from "./guard.mjs";

export function requireLegacyContainer() {
  const out = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", LEGACY.dbContainer], { encoding: "utf8" });
  if (out.status !== 0 || out.stdout.trim() !== "true") {
    throw new Error(`The local ${LEGACY.project} database container is not running. Start it: node scripts/legacy-local/stack.mjs start --confirm ${LEGACY.project}`);
  }
}

/** Runs SQL (from stdin) inside the maroon-legacy container. ON_ERROR_STOP: the first error stops everything. */
export function psqlLegacy(sql, { user = "postgres", vars = {}, quiet = true } = {}) {
  requireLegacyContainer();
  const settings = Object.entries(vars).map(([name, value]) => `\\set ${name} '${String(value).replace(/'/g, "''")}'\n`).join("");
  const out = spawnSync("docker", ["exec", "-i", LEGACY.dbContainer, "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-X", ...(quiet ? ["-q"] : []), "-A", "-t", "-F", "\t"], { input: settings + sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`SQL failed in ${LEGACY.project}: ${(out.stderr || "").trim().split("\n").slice(-3).join(" | ")}`);
  return out.stdout;
}

/** Local API address and keys of the maroon-legacy stack (never a hosted project). Values are never printed. */
export function legacyKeys(root = process.cwd()) {
  const text = execFileSync("npx", ["--no-install", "supabase", "status", "-o", "env", "--workdir", join(root, LEGACY.workdir)], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  const problems = [...legacyApiProblems(env.API_URL), ...hostedTargetProblems({ API_URL: env.API_URL })];
  if (problems.length || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error(`Local ${LEGACY.project} keys unavailable or wrong: ${problems.join("; ") || "missing keys"}`);
  return { api: env.API_URL, serviceKey: env.SERVICE_ROLE_KEY, anonKey: env.ANON_KEY };
}
