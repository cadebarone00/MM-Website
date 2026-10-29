// Pending accounts Phase 2: the server account lifecycle (lib/profile/currentProfile.ts getAccountLifecycle*) against the
// ISOLATED local Supabase, through real sign-ins (web cookie and app Bearer token).
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/lifecycle-regression.mts
// Installs supabase/account_activation.sql on the isolated stack only (inert foundation; activation is switched on and a
// test legal version set THERE, never on a hosted project). Read-only checks: the lifecycle never writes anything.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { addr, anon, browser, call, confirmByEmail, account, q, sql, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: setupPOST } = await import("../../app/api/account/profile/route.ts");
const { getAccountLifecycle, getAccountLifecycleForRequest, getCurrentProfileForRequest } = await import("../../lib/profile/currentProfile.ts");

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
type Json = Record<string, unknown>;
/** The lifecycle as a route would see it (no account object: just what matters for the checks). */
const lifecycleRoute = async (request: Request) => {
  const l = await getAccountLifecycleForRequest(request) as Json;
  return Response.json({ state: l.state, details: l.details ?? null, reason: l.reason ?? null,
    profileId: (l.profile as Json | undefined)?.profileId ?? l.profileId ?? null, accountId: (l.account as Json | undefined)?.id ?? null });
};
const cookieOnlyRoute = async () => {
  const l = await getAccountLifecycle() as Json;
  return Response.json({ state: l.state, accountId: (l.account as Json | undefined)?.id ?? null });
};
/** The EXISTING per-request profile check, unchanged. It throws when the profile query is refused (a closed account). */
const legacyRoute = async (request: Request) => {
  try { return Response.json({ status: (await getCurrentProfileForRequest(request)).status }); }
  catch (e) { return Response.json({ status: "threw", message: (e as Error).message }); }
};
const viaCookie = async (jar: Jar) => (await call(jar, lifecycleRoute, "/lifecycle", undefined, { method: "GET" })).json!;
const viaBearer = async (token: string) => (await call(browser(), lifecycleRoute, "/lifecycle", undefined, { method: "GET", headers: { authorization: `Bearer ${token}` } })).json!;

// Inert foundation on the isolated stack; this test switches activation on there only.
execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("supabase/account_activation.sql") });
sql(`update public.account_activation_settings set activation_enabled = true;
  insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
  on conflict (document) do update set current_version = excluded.current_version;`);

/** Sign up, verify, sign in through the app: a cookie session (profile initialized, not finished). */
async function person(name: string, finishSetup: boolean) {
  const email = addr(name), password = "lifecycle-pass-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  if (finishSetup) await call(jar, setupPOST, "/api/account/profile", { displayName: `${name} Golfer`, username: `${name.replace(/-/g, "_")}_${Date.now() % 100000}` });
  const token = (await anon().auth.signInWithPassword({ email, password })).data.session!.access_token;
  return { id: account(email)!.id, jar, token };
}
const ready = (id: string, birthdate = "1991-07-07") => sql(`select public.set_my_birthdate(${q(id)}, ${q(birthdate)});
  select public.record_terms_acceptance(${q(id)}, 'terms', 'local-test', 'signup');
  select public.record_terms_acceptance(${q(id)}, 'privacy', 'local-test', 'signup');`);
const tenYearsAgo = () => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - 10); return d.toISOString().slice(0, 10); };
const goldenRows = () => sql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
  select row_to_json(p)::text x from public.profiles p union all select row_to_json(m)::text from public.golf_trip_members m
  union all select row_to_json(s)::text from public.player_slots s
  union all select row_to_json(r)::text from public.player_rounds r) t`);

section("Signed out");
{
  const r = await viaCookie(browser());
  check("no session -> signed-out", r.state === "signed-out", JSON.stringify(r));
  const bad = await call(browser(), lifecycleRoute, "/lifecycle", undefined, { method: "GET", headers: { authorization: "Bearer not-a-real-token" } });
  check("invalid bearer token is not a session", bad.status !== 200 || (bad.json as Json)?.state === "signed-out", JSON.stringify(bad));
}

section("Pending: new account, then with name + username");
const fresh = await person("lc-new", false);
const named = await person("lc-named", true);
{
  const r = await viaCookie(fresh.jar);
  check("new verified account -> pending (details: incomplete)", r.state === "pending" && r.details === "incomplete" && r.profileId === fresh.id, JSON.stringify(r));
  const n = await viaCookie(named.jar);
  check("name + username present -> STILL pending (details: complete)", n.state === "pending" && n.details === "complete", JSON.stringify(n));
  const legacy = (await call(named.jar, legacyRoute, "/legacy", undefined, { method: "GET" })).json as Json;
  check("compatibility: existing getCurrentProfile still says ok for the same account (routes unchanged)", legacy.status === "ok", JSON.stringify(legacy));
}

section("Active (Finish) — cookie and Bearer agree, same permanent profile id");
const golfer = await person("lc-active", true);
{
  ready(golfer.id);
  const finish = JSON.parse(sql(`select public.activate_my_profile(${q(golfer.id)})`));
  check("Finish activated", finish.activated === true, JSON.stringify(finish));
  const c = await viaCookie(golfer.jar), b = await viaBearer(golfer.token);
  check("cookie -> active", c.state === "active" && c.profileId === golfer.id, JSON.stringify(c));
  check("bearer -> active, same account and profile id", b.state === "active" && b.profileId === golfer.id && b.accountId === golfer.id, JSON.stringify(b));
  const cookieOnly = (await call(golfer.jar, cookieOnlyRoute, "/cookie", undefined, { method: "GET" })).json as Json;
  check("cookie-only getAccountLifecycle() -> active", cookieOnly.state === "active" && cookieOnly.accountId === golfer.id, JSON.stringify(cookieOnly));
  const p = await viaBearer(named.token);
  check("bearer on a pending account -> pending (no upgrade)", p.state === "pending", JSON.stringify(p));
}

section("Legacy active account without a birthday");
const veteran = await person("lc-legacy", true);
{
  sql(`select set_config('maroon.activation', 'on', false); update public.profiles set activated_at = now() where id = ${q(veteran.id)};`);
  const r = await viaCookie(veteran.jar);
  check("activated, no birthday -> active_needs_birthday", r.state === "active_needs_birthday" && r.profileId === veteran.id, JSON.stringify(r));
  sql(`select public.set_my_birthdate(${q(veteran.id)}, '1970-01-01')`);
  check("after the Birthday step -> active", (await viaCookie(veteran.jar)).state === "active");
}

section("Ineligible and restricted");
const kid = await person("lc-kid", true);
const held = await person("lc-review", true);
{
  ready(kid.id, tenYearsAgo());
  const r = await viaCookie(kid.jar), b = await viaBearer(kid.token);
  check("under 13 -> ineligible (cookie)", r.state === "ineligible", JSON.stringify(r));
  check("under 13 -> ineligible (bearer)", b.state === "ineligible", JSON.stringify(b));
  check("answer carries no date, age or reason", !JSON.stringify([r, b]).includes(tenYearsAgo().slice(0, 4)) && r.reason === null);
  sql(`insert into public.account_eligibility (account_id, status, reason) values (${q(held.id)}, 'review', 'manual')`);
  check("manual review -> restricted", (await viaCookie(held.jar)).state === "restricted");
}

section("Deleted accounts keep the existing protections");
const leaver = await person("lc-deleted", true);
{
  sql(`select public.request_account_deletion(${q(leaver.id)})`);
  const r = await viaCookie(leaver.jar);
  check("deletion requested -> deleted", r.state === "deleted", JSON.stringify(r));
  const legacy = (await call(leaver.jar, legacyRoute, "/legacy", undefined, { method: "GET" })).json as Json;
  check("existing getCurrentProfileForRequest unchanged: still refuses (throws) for a closed account", legacy.status === "threw" && legacy.message === "Profile lookup unavailable.", JSON.stringify(legacy));
}

section("Read-only: no duplicate profiles, no golf record changes");
{
  const before = goldenRows();
  const profilesBefore = sql("select count(*) from public.profiles");
  for (const p of [fresh, named, golfer, veteran, kid, held]) { await viaCookie(p.jar); await viaBearer(p.token); await viaCookie(p.jar); }
  check("profiles, memberships, player slots and rounds byte-identical after 18 lifecycle reads", goldenRows() === before);
  check("no profile created", sql("select count(*) from public.profiles") === profilesBefore);
  check("each account has exactly one profile", sql(`select count(*) from public.profiles where id in (${[fresh, named, golfer, veteran, kid, held].map((p) => q(p.id)).join(",")})`) === "6");
}

section("Missing database foundation (function not installed)");
try {
  sql("alter function public.account_lifecycle_state(uuid) rename to account_lifecycle_state_hidden; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2000));
  const n = await viaCookie(named.jar), g = await viaCookie(golfer.jar), d = await viaCookie(leaver.jar);
  check("finished-looking profile -> unavailable/foundation_missing, NOT active", n.state === "unavailable" && n.reason === "foundation_missing", JSON.stringify(n));
  check("even an activated account isn't assumed active without the function", g.state === "unavailable" && g.reason === "foundation_missing", JSON.stringify(g));
  check("deleted account still deleted (existing check)", d.state === "deleted", JSON.stringify(d));
  const legacy = (await call(named.jar, legacyRoute, "/legacy", undefined, { method: "GET" })).json as Json;
  check("existing getCurrentProfile unaffected", legacy.status === "ok", JSON.stringify(legacy));
} finally {
  sql("alter function public.account_lifecycle_state_hidden(uuid) rename to account_lifecycle_state; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2000));
}
check("function restored", (await viaCookie(golfer.jar)).state === "active");

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
