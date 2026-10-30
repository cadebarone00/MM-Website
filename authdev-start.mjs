// maroon-auth-dev test workspace launcher (this worktree only; not committed).
//   node authdev-start.mjs           check the settings, then run the site on http://localhost:3002
//   node authdev-start.mjs --check   check only
// It refuses to start unless this folder can ONLY reach the maroon-auth-dev Supabase project. It never prints a key.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 3002;
const ENV_FILE = join(ROOT, ".env.development.local");
// The production settings live in the main folder. Read only to make sure nothing here matches them.
const PROD_ENV = resolve(process.env.AUTHDEV_PROD_ENV ?? join(ROOT, "..", "MM-Website", ".env"));
// Next.js would also load any of these, and they win over nothing we control here, so none may exist in this folder.
const FORBIDDEN_FILES = [".env", ".env.local", ".env.development", ".env.production", ".env.production.local", ".env.test", ".env.test.local"];
const REQUIRED = ["AUTHDEV_SUPABASE_REF", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const OPTIONAL = ["MAROON_V2_ONBOARDING", "MAROON_ACCOUNT_ENFORCEMENT"];

const problems = [];
const fail = (message) => problems.push(message);
const ok = (message) => console.log(`  ok  ${message}`);

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

const hostOf = (url) => { try { return new URL(url).host.toLowerCase(); } catch { return null; } };
/** Supabase's older keys are JWTs carrying the project ref and role; newer ones start with sb_publishable_ / sb_secret_. */
function keyInfo(key) {
  if (key.startsWith("sb_publishable_")) return { kind: "public" };
  if (key.startsWith("sb_secret_")) return { kind: "secret" };
  const parts = key.split(".");
  if (parts.length !== 3) return { kind: "unknown" };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return { kind: payload.role === "service_role" ? "secret" : payload.role === "anon" ? "public" : "unknown", ref: payload.ref };
  } catch {
    return { kind: "unknown" };
  }
}

console.log("maroon-auth-dev workspace checks");

// 1. Right folder.
if (basename(ROOT) !== "MM-Website-authdev") fail(`This script only runs in the MM-Website-authdev folder (found "${basename(ROOT)}").`);
else ok("running in MM-Website-authdev");

// 2. Nothing in the shell that would override the file (Next.js lets shell values win).
const shellNames = Object.keys(process.env).filter((name) => /SUPABASE/i.test(name));
if (shellNames.length) fail(`Supabase settings are set in this terminal (${shellNames.join(", ")}). Open a fresh terminal without them.`);
else ok("no Supabase settings in the terminal environment");

// 3. Only the one dev settings file.
const extra = FORBIDDEN_FILES.filter((name) => existsSync(join(ROOT, name)));
if (extra.length) fail(`Remove ${extra.join(", ")} from this folder. Only .env.development.local is allowed here.`);
else ok("no other .env files that Next.js would load");

let env = null;
if (!existsSync(ENV_FILE)) fail("Missing .env.development.local. Copy .env.authdev.example to .env.development.local and fill it in.");
else env = readEnv(ENV_FILE);

if (env) {
  // 4. Every value present, nothing unexpected.
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length) fail(`Fill in: ${missing.join(", ")}.`);
  const unexpected = Object.keys(env).filter((name) => !REQUIRED.includes(name) && !OPTIONAL.includes(name));
  if (unexpected.length) fail(`Remove settings this workspace must not have: ${unexpected.join(", ")}.`);
  const spaced = REQUIRED.filter((name) => env[name] && /\s/.test(env[name]));
  if (spaced.length) fail(`Remove spaces or notes after the value of: ${spaced.join(", ")}.`);
  for (const flag of OPTIONAL) if (env[flag]) console.log(`  note ${flag} is set (leave it unset for the first round of tests)`);

  if (!missing.length && !spaced.length) {
    const ref = env.AUTHDEV_SUPABASE_REF.toLowerCase();
    const devHost = `${ref}.supabase.co`;
    // 5. Both URLs are exactly the dev project.
    if (!/^[a-z0-9]{10,40}$/.test(ref)) fail("AUTHDEV_SUPABASE_REF should be just the project id (letters and numbers).");
    if (env.SUPABASE_URL.replace(/\/+$/, "") !== `https://${devHost}`) fail("SUPABASE_URL must be exactly https://<AUTHDEV_SUPABASE_REF>.supabase.co");
    if (env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL) fail("NEXT_PUBLIC_SUPABASE_URL must be the same as SUPABASE_URL.");
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== env.SUPABASE_ANON_KEY) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY must be the same as SUPABASE_ANON_KEY.");

    // 6. Keys are in the right slots (a secret key must never reach the browser) and, when they say so, belong to this project.
    const anon = keyInfo(env.SUPABASE_ANON_KEY), secret = keyInfo(env.SUPABASE_SERVICE_ROLE_KEY);
    if (anon.kind === "secret") fail("SUPABASE_ANON_KEY holds a SECRET key. Use the anon / publishable key (the secret one would be sent to browsers).");
    if (secret.kind === "public") fail("SUPABASE_SERVICE_ROLE_KEY holds the public key. Use the service_role / secret key.");
    if (env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) fail("The anon key and the service_role key are the same value.");
    for (const [name, info] of [["SUPABASE_ANON_KEY", anon], ["SUPABASE_SERVICE_ROLE_KEY", secret]]) {
      if (info.ref && info.ref !== ref) fail(`${name} belongs to a different project than AUTHDEV_SUPABASE_REF.`);
    }

    // 7. Nothing matches production.
    if (!existsSync(PROD_ENV)) fail("Can't find the main folder's .env to compare against, so production can't be ruled out. Stopping.");
    else {
      const prod = readEnv(PROD_ENV);
      const prodHosts = new Set([prod.SUPABASE_URL, prod.NEXT_PUBLIC_SUPABASE_URL].map((url) => url && hostOf(url)).filter(Boolean));
      const prodKeys = new Set([prod.SUPABASE_ANON_KEY, prod.SUPABASE_SERVICE_ROLE_KEY, prod.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean));
      const prodRefs = new Set([...prodKeys].map((key) => keyInfo(key).ref).filter(Boolean));
      if (prodHosts.has(devHost) || prodRefs.has(ref)) fail("This is the PRODUCTION project. Use the maroon-auth-dev values.");
      const reused = ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((name) => prodKeys.has(env[name]));
      if (reused.length) fail(`${reused.join(", ")} matches a PRODUCTION key. Use the maroon-auth-dev keys.`);
      if (!prodHosts.size) fail("The main folder's .env has no Supabase URL to compare against. Stopping.");
    }
    if (!problems.length) ok(`settings point only at maroon-auth-dev, none match production`);
  }
}

// 8. Port free.
const portFree = await new Promise((done) => {
  const probe = createServer().once("error", () => done(false)).once("listening", () => probe.close(() => done(true)));
  probe.listen(PORT);
});
if (!portFree) fail(`Port ${PORT} is already in use. Close whatever is using it first.`);
else ok(`port ${PORT} is free`);

if (problems.length) {
  console.log("\nNOT STARTED:");
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log("\nAll checks passed (check only, nothing started).");
  process.exit(0);
}
console.log(`\nStarting http://localhost:${PORT} ...`);
const next = spawn(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)], { cwd: ROOT, stdio: "inherit" });
next.on("exit", (code) => process.exit(code ?? 0));
