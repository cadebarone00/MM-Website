// Shared pieces for the local auth scripts (reproduce.mts = Step 2c record, regression.mts = Step 2d tests).
// Importing this file IS the isolation guard: it refuses to run unless the isolated stack from setup.mjs answers on
// 127.0.0.1:55321, replaces every SUPABASE env var with that stack's local keys (no .env file is read), and makes every
// network request fail unless it goes to 127.0.0.1 / localhost.
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { authLocalStack } from "./stack.mjs";

const stack = authLocalStack();
const statusText = execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json", "--workdir", stack.workdir], { shell: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
export const status = JSON.parse(statusText.slice(statusText.indexOf("{"), statusText.lastIndexOf("}") + 1)) as Record<string, string>;
export const API = status.API_URL;
export const MAIL = status.MAILPIT_URL ?? status.INBUCKET_URL;
if (API !== stack.api || !MAIL?.startsWith(stack.mail)) throw new Error(`Refusing to run: not the isolated local stack "${stack.name}" (${API}, ${MAIL})`);
for (const key of Object.keys(process.env)) if (/SUPABASE/i.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_URL: API, SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: API, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY });

const realFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error(`BLOCKED non-local request to ${url.host}`);
  requests++;
  return realFetch(input, init);
}) as typeof fetch;
export const requestCount = () => requests;

export const sql = (query: string) => execFileSync("docker", ["exec", stack.dbContainer, "psql", "-U", "postgres", "-t", "-A", "-F", "|", "-c", query]).toString().trim();

// The stack must have been built by THIS checkout's setup.mjs (its SQL files), not another worktree's. Stacks built
// before this stamp existed only get a warning, so runs already relying on them keep working.
{
  const built = sql("select case when to_regclass('public.auth_local_build') is null then '' else (select built->>'checkout' from public.auth_local_build limit 1) end");
  const here = realpathSync(process.cwd()).toLowerCase();
  if (!built) console.warn(`WARNING: stack "${stack.name}" has no build stamp; it may have been built from another checkout, so database rules may differ from this one.`);
  else if (realpathSync(built).toLowerCase() !== here) {
    throw new Error(`Refusing to run: stack "${stack.name}" was built from ${built || "an unknown checkout"}, not ${process.cwd()}. `
      + `Rebuild it from here (node scripts/auth-local/setup.mjs), or use your own stack (AUTH_LOCAL_STACK=main).`);
  }
}
export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
export const admin = createClient(API, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = () => createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export type Jar = Map<string, string>;
export const browser = (): Jar => new Map();
// `never` params: any route's own params type accepts it (the test supplies the right keys per call).
type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
/** Runs one route handler as the browser that owns `jar`. */
export async function call(jar: Jar, handler: Handler, path: string, body?: unknown,
  options: { method?: string; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  (globalThis as { __authLocalJar?: Jar }).__authLocalJar = jar;
  const store = ((globalThis as { __authLocalStore?: AsyncLocalStorage<Jar> }).__authLocalStore ??= new AsyncLocalStorage<Jar>());
  const method = options.method ?? "POST";
  const headers = { "Content-Type": "application/json", origin: "http://127.0.0.1:3999", ...options.headers };
  const request = new Request(`http://127.0.0.1:3999${path}`, method === "GET" ? { method, headers } : { method, headers, body: JSON.stringify(body ?? {}) });
  // Each request keeps its own jar even when several run at once.
  const response = await store.run(jar, () => handler(request, { params: Promise.resolve(options.params ?? {}) as Promise<never> }));
  const text = await response.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* redirects have no JSON */ }
  return { status: response.status, json: json as Record<string, unknown> | null, location: response.headers.get("location") };
}

export const account = (email: string) => {
  const row = sql(`select id, email_confirmed_at is not null, md5(coalesce(encrypted_password,'')) from auth.users where email = ${q(email)}`);
  if (!row) return null;
  const [id, confirmed, passwordFingerprint] = row.split("|");
  return { id, confirmed: confirmed === "t", passwordFingerprint };
};
export const profile = (id: string) => {
  const row = sql(`select coalesce(username,'<null>'), coalesce(display_name,'<null>'), coalesce(player_slug,'') from public.profiles where id = ${q(id)}`);
  if (!row) return null;
  const [username, displayName, playerSlug] = row.split("|");
  return { username: username === "<null>" ? null : username, displayName: displayName === "<null>" ? null : displayName, playerSlug: playerSlug || null };
};
export const slot = (slug: string) => {
  const [claimedBy, passwordCreated] = sql(`select coalesce(claimed_by::text,''), password_created from public.player_slots where player_slug = ${q(slug)}`).split("|");
  return { claimedBy: claimedBy || null, passwordCreated: passwordCreated === "t" };
};
/** [slug, code] of a player nobody has claimed (and, on V2, nobody has a pending invitation for, and not locked by an
 *  earlier suite's account deletion — suites share one database, so a deletion run before leaves its slot locked). */
export const unclaimedCode = () => {
  const v2 = sql("select to_regclass('public.player_claim_invitations') is not null") === "t";
  const lockable = sql("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_slots' and column_name = 'claim_locked_at')") === "t";
  return sql(`select player_slug || '|' || username from public.player_slots where claimed_by is null and username is not null
    ${v2 ? "and player_slug not in (select player_slug from public.player_claim_invitations)" : ""}
    ${lockable ? "and claim_locked_at is null" : ""} order by player_slug limit 1`).split("|");
};

export async function latestLink(email: string, kind: "signup" | "recovery" | "invite"): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json() as { messages: { ID: string }[] };
    for (const message of list.messages ?? []) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${message.ID}`)).json() as { Text?: string; HTML?: string };
      const link = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(new RegExp(`${API.replace(/[.:/]/g, "\\$&")}/auth/v1/verify\\?[^"'\\s<>]*type=${kind}[^"'\\s<>]*`));
      if (link) return link[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} email for ${email}`);
}
export const mailCount = async (email: string) => ((await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as { messages_count?: number }).messages_count ?? 0;
/** Opens the newest link of that kind (as the person would) and returns where Supabase redirects. */
export async function openLink(email: string, kind: "signup" | "recovery" | "invite") {
  return (await fetch(await latestLink(email, kind), { redirect: "manual" })).headers.get("location") ?? "";
}
export const confirmByEmail = (email: string) => openLink(email, "signup");

const run = Date.now().toString(36);
/** Unique reserved-domain address for this run. */
export const addr = (name: string) => `${name}-${run}@auth-local.test`;
export const runId = run;
/** Supabase throttles repeat emails to one address (max_frequency: 1s here, 60s by default on hosted projects). */
export const pastThrottle = () => new Promise((r) => setTimeout(r, 1600));

export async function authVersion() {
  return ((await (await fetch(`${API}/auth/v1/health`, { headers: { apikey: status.ANON_KEY } })).json()) as { version?: string }).version;
}
