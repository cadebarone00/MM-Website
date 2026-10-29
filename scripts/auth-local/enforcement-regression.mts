// Pending accounts Phase 5: Active-only enforcement, end to end, against the ISOLATED local Supabase.
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/enforcement-regression.mts
// Drives the REAL middleware.ts (pages + APIs, cookie + Bearer) with MAROON_ACCOUNT_ENFORCEMENT off and on, the real
// invitation route, and the database with supabase/account_activation_enforcement.sql applied to THIS STACK ONLY
// (run it last: it changes this stack's rules for later suites until setup.mjs rebuilds it). Nothing hosted is touched.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { addr, anon, API, browser, call, confirmByEmail, account, q, sql, status, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { middleware } = await import("../../middleware.ts");
const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: setupPOST } = await import("../../app/api/account/profile/route.ts");
const { POST: invitePOST } = await import("../../app/api/golf-trips/invitations/[token]/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: tripsGET } = await import("../../app/api/golf-trips/route.ts");
const { PATCH: profilePATCH } = await import("../../app/api/account/profile/route.ts");
const { PUT: privacyPUT } = await import("../../app/api/account/privacy/route.ts");

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
type Json = Record<string, unknown>;
const ymd = (yearsBack: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - yearsBack); return d.toISOString().slice(0, 10); };
const psql = (file: string) => execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync(file) });
const flag = (on: boolean) => { if (on) process.env.MAROON_ACCOUNT_ENFORCEMENT = "on"; else delete process.env.MAROON_ACCOUNT_ENFORCEMENT; };

psql("supabase/account_activation.sql");
sql(`update public.account_activation_settings set activation_enabled = true;
  insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
  on conflict (document) do update set current_version = excluded.current_version;`);

type Person = { id: string; email: string; password: string; jar: Jar; token: string };
async function person(name: string): Promise<Person> {
  const email = addr(name), password = "enforcement-pass-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  await call(jar, setupPOST, "/api/account/profile", { displayName: `${name} Golfer`, username: `${name.replace(/-/g, "_")}_${Date.now() % 100000}` });
  const token = (await anon().auth.signInWithPassword({ email, password })).data.session!.access_token;
  return { id: account(email)!.id, email, password, jar, token };
}
const activate = (p: Person) => sql(`select public.set_my_birthdate(${q(p.id)}, '1990-02-02'); select public.record_terms_acceptance(${q(p.id)}, 'terms', 'local-test', 'signup');
  select public.record_terms_acceptance(${q(p.id)}, 'privacy', 'local-test', 'signup'); select public.activate_my_profile(${q(p.id)});`);
const freshToken = async (p: Person) => (await anon().auth.signInWithPassword({ email: p.email, password: p.password })).data.session!.access_token;

/** Run the real middleware for one request as a browser (cookie jar) and/or app (Bearer). */
async function gate(path: string, opts: { jar?: Jar; token?: string; method?: string } = {}) {
  const headers = new Headers();
  if (opts.jar?.size) headers.set("cookie", [...opts.jar].map(([k, v]) => `${k}=${v}`).join("; "));
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  const response = await middleware(new NextRequest(`http://127.0.0.1:3999${path}`, { method: opts.method ?? "GET", headers }));
  const passed = response.headers.get("x-middleware-next") === "1";
  let body: Json | null = null;
  if (!passed && response.headers.get("content-type")?.includes("json")) body = await response.json() as Json;
  return { passed, status: response.status, location: response.headers.get("location"), body };
}
const redirectedToStatus = (r: Awaited<ReturnType<typeof gate>>) => !r.passed && r.status === 307 && (r.location ?? "").endsWith("/account/status");

const PROTECTED_PAGES = ["/", "/golf-trips", "/golf-trips/new", "/tournaments", "/tournaments/code/join", "/rounds/new", "/profile", "/profile/search", "/pickems", "/dashboard"];
const PROTECTED_APIS: [string, string][] = [["/api/golf-trips", "GET"], ["/api/golf-trips", "POST"], ["/api/code-tournaments/join", "POST"], ["/api/rounds/shared", "POST"],
  ["/api/profile/search", "GET"], ["/api/profile/friends", "POST"], ["/api/platform/tournaments", "POST"], ["/api/portal/admin/matches/start", "POST"], ["/api/tap-in/display", "GET"]];
const OPEN_FOR_ALL: [string, string][] = [["/settings", "GET"], ["/settings/delete-account", "GET"], ["/account/status", "GET"], ["/api/account/onboarding", "GET"],
  ["/api/account/birthday", "POST"], ["/api/account/finish", "POST"], ["/api/account/birthday-correction", "POST"], ["/api/account/delete", "POST"],
  ["/api/account/terms", "POST"], ["/api/auth/signout", "POST"], ["/website", "GET"], ["/watch/W4K9PZ", "GET"], ["/api/watch/W4K9PZ", "GET"], ["/t/acme/2027", "GET"]];

// --- People in every state ---------------------------------------------------------------------------------------------
const active = await person("enf-active");
activate(active);
const pending = await person("enf-pending");
const legacy = await person("enf-legacy");
sql(`select set_config('maroon.activation', 'on', false); update public.profiles set activated_at = now() where id = ${q(legacy.id)};`);
const restricted = await person("enf-review");
activate(restricted);
sql(`insert into public.account_eligibility (account_id, status, reason) values (${q(restricted.id)}, 'review', 'manual')`);
const kid = await person("enf-kid");
const host = await person("enf-host");
activate(host);
const payload = (golfTripPayloadFromBody({ tripName: "Enforcement Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8",
  yourName: "Host", yourEmail: "host@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no",
  knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no", requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload }).payload;
const tripId = JSON.parse(sql(`select public.create_golf_trip(${q(host.id)}, ${q(JSON.stringify(payload))}::jsonb)`)).tripId as string;
sql(`insert into public.golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values (${q(tripId)}, ${q(kid.id)}, 'Kid', 'member', 'accepted')`);
await call(browser(), (await import("../../app/api/account/birthday/route.ts")).POST, "/api/account/birthday", { birthdate: ymd(10) }, { headers: { authorization: `Bearer ${kid.token}` } });
check("setup: kid is Ineligible and locked (has a trip membership)", sql(`select public.account_lifecycle_state(${q(kid.id)}) || '|' || (select cleanup_state from public.account_eligibility where account_id = ${q(kid.id)})`) === "ineligible|locked");
const kidFresh = await freshToken(kid);
const golfRows = () => sql(`select md5(string_agg(row_to_json(m)::text, '|' order by m.id)) from public.golf_trip_members m`) + sql(`select md5(string_agg(row_to_json(t)::text, '|' order by t.id)) from public.golf_trips t`);

section("Enforcement OFF (default): every request passes exactly as before");
{
  flag(false);
  const everyone: [string, Person, string?][] = [["active", active], ["pending", pending], ["legacy", legacy], ["restricted", restricted], ["ineligible", kid, kidFresh]];
  let allPassed = true;
  for (const [, p, token] of everyone) {
    for (const path of PROTECTED_PAGES) allPassed &&= (await gate(path, { jar: token ? undefined : p.jar, token })).passed;
    for (const [path, method] of PROTECTED_APIS) allPassed &&= (await gate(path, { token: token ?? p.token, method })).passed;
  }
  check("off: all 5 states × 10 pages × 9 APIs pass through untouched", allPassed);
}

flag(true);
section("Enforcement ON: Active passes everywhere it should");
{
  let ok = true;
  for (const path of PROTECTED_PAGES) ok &&= (await gate(path, { jar: active.jar })).passed;
  for (const [path, method] of PROTECTED_APIS) ok &&= (await gate(path, { token: active.token, method })).passed;
  check("Active: all protected pages (cookie) and APIs (Bearer) pass", ok);
}

section("Enforcement ON: Pending / legacy-needs-birthday / restricted / Ineligible are redirected or refused");
for (const [label, p, token, code] of [["pending", pending, undefined, "finish_onboarding"], ["legacy needs birthday", legacy, undefined, "finish_onboarding"],
  ["restricted", restricted, undefined, "restricted"], ["ineligible (fresh sign-in)", kid, kidFresh, "not_eligible"]] as [string, Person, string | undefined, string][]) {
  let pages = true;
  for (const path of PROTECTED_PAGES) pages &&= token ? true : redirectedToStatus(await gate(path, { jar: p.jar }));
  if (!token) check(`${label}: all protected pages -> 307 /account/status`, pages);
  const results = await Promise.all(PROTECTED_APIS.map(([path, method]) => gate(path, { token: token ?? p.token, method })));
  check(`${label}: all protected APIs refused with code ${code}`, results.every((r) => !r.passed && r.body?.code === code),
    JSON.stringify(results.map((r) => r.body?.code ?? (r.passed ? "PASSED" : r.status))));
  check(`${label}: refusals carry no private data`, results.every((r) => r.body && Object.keys(r.body).sort().join() === "code,error,next,ok"));
}

section("Enforcement ON: onboarding, settings, deletion, correction and public routes stay open for every state");
{
  let ok = true;
  const detail: string[] = [];
  for (const [label, p, token] of [["pending", pending, undefined], ["restricted", restricted, undefined], ["ineligible", kid, kidFresh], ["legacy", legacy, undefined]] as [string, Person, string | undefined][]) {
    for (const [path, method] of OPEN_FOR_ALL) {
      const r = await gate(path, path.startsWith("/api/") ? { token: token ?? p.token, method } : { jar: token ? undefined : p.jar, token, method });
      if (!r.passed) { ok = false; detail.push(`${label} ${method} ${path}`); }
    }
  }
  check("no loops, no stranded accounts: every open route passes for every state", ok, detail.join(", "));
  check("signed-out requests pass through to the route's own handling", (await gate("/golf-trips")).passed && (await gate("/api/golf-trips", { method: "POST" })).passed);
}

section("Enforcement ON: cookie / Bearer consistency and revoked tokens");
{
  const conflict = await gate("/api/golf-trips", { jar: active.jar, token: pending.token });
  check("one account's cookie + another's Bearer -> 401 session_conflict", conflict.status === 401 && conflict.body?.code === "session_conflict", JSON.stringify(conflict.body));
  check("Bearer decides for app requests (Pending token refused even with no cookie)", (await gate("/api/golf-trips", { token: pending.token })).body?.code === "finish_onboarding");
  const revoked = await gate("/api/golf-trips", { token: kid.token });
  check("revoked (pre-under-13) token -> treated as signed out, never as Active", revoked.passed);
  const routeAnswer = await call(browser(), tripsGET as never, "/api/golf-trips", undefined, { method: "GET", headers: { authorization: `Bearer ${kid.token}` } });
  check("...and the route itself then refuses it (401)", routeAnswer.status === 401, JSON.stringify(routeAnswer.json));
  check("garbage token -> treated as signed out (route refuses)", (await gate("/api/golf-trips", { token: "not-a-token" })).passed);
}

section("Enforcement ON: phone-app (Bearer) account self-service APIs (Phase 7B)");
{
  flag(true);
  const SELF_SERVICE: [string, string][] = [["/api/account/profile", "PATCH"], ["/api/account/photo", "POST"], ["/api/account/privacy", "PUT"]];
  for (const [path, method] of SELF_SERVICE) {
    check(`gate passes ${method} ${path} for an Active Bearer`, (await gate(path, { token: active.token, method })).passed);
    check(`gate passes ${method} ${path} for a Pending Bearer (onboarding)`, (await gate(path, { token: pending.token, method })).passed);
    // "account" paths pass the gate untouched by design (Phase 5); the ROUTE refuses mixed identities (checked below).
    check(`gate leaves ${method} ${path} to the route even with mixed cookie + Bearer`, (await gate(path, { jar: active.jar, token: pending.token, method })).passed);
  }
  const mixed = await call(active.jar, profilePATCH as never, "/api/account/profile", { displayName: "Mixed" }, { method: "PATCH", headers: { authorization: `Bearer ${pending.token}` } });
  check("route: mixed cookie + Bearer refused (401), nothing changed", mixed.status === 401
    && sql(`select count(*) from public.profiles where display_name = 'Mixed' and id in (${q(active.id)}, ${q(pending.id)})`) === "0", JSON.stringify(mixed.json));
  const bearer = (token: string) => ({ method: "PATCH", headers: { authorization: `Bearer ${token}` } });
  let r = await call(browser(), profilePATCH as never, "/api/account/profile", { displayName: "Pending App" }, bearer(pending.token));
  check("route: Pending Bearer may set its name", r.status === 200, JSON.stringify(r.json));
  r = await call(browser(), profilePATCH as never, "/api/account/profile", { displayName: "Review App" }, bearer(restricted.token));
  check("route: restricted Bearer refused (403 restricted)", r.status === 403 && r.json?.code === "restricted", JSON.stringify(r.json));
  r = await call(browser(), profilePATCH as never, "/api/account/profile", { displayName: "Kid App" }, bearer(kidFresh));
  check("route: Ineligible Bearer refused (403 not_eligible)", r.status === 403 && r.json?.code === "not_eligible", JSON.stringify(r.json));
  r = await call(browser(), privacyPUT as never, "/api/account/privacy", { visibility: "public" }, { method: "PUT", headers: { authorization: `Bearer ${kidFresh}` } });
  check("route: Ineligible Bearer can't make itself public", r.status === 403);
  r = await call(browser(), profilePATCH as never, "/api/account/profile", { displayName: "Old Kid Token" }, bearer(kid.token));
  check("route: a token revoked at the under-13 birthday -> 401", r.status === 401);
}

section("Enforcement ON: missing database function -> fail closed");
try {
  sql("alter function public.account_lifecycle_state(uuid) rename to account_lifecycle_state_hidden; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
  const page = await gate("/golf-trips", { jar: active.jar });
  const api = await gate("/api/golf-trips", { token: active.token });
  check("page -> /account/status (recoverable error page)", redirectedToStatus(page), JSON.stringify(page));
  check("API -> 503 unavailable (never treated as Active)", api.status === 503 && api.body?.code === "unavailable", JSON.stringify(api.body));
  check("open routes still pass", (await gate("/settings", { jar: active.jar })).passed && (await gate("/api/account/onboarding", { token: active.token })).passed);
} finally {
  sql("alter function public.account_lifecycle_state_hidden(uuid) rename to account_lifecycle_state; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
}

section("Enforcement ON: Golf Trip invitations (hold for Pending, accept at Finish, never overwrite)");
{
  const before = golfRows();
  const token = `enf-invite-${randomUUID()}`;
  sql(`select public.invite_golf_trip_member(${q(host.id)}, ${q(tripId)}, '{"displayName":"Newcomer"}'::jsonb, ${q(token)})`);
  const newcomer = await person("enf-newcomer");
  check("invite API passes the gate for Pending", (await gate(`/api/golf-trips/invitations/${token}`, { token: newcomer.token, method: "POST" })).passed);
  const held = await call(browser(), invitePOST, `/api/golf-trips/invitations/${token}`, {}, { params: { token }, headers: { authorization: `Bearer ${newcomer.token}` } });
  check("Pending 'accept' -> held, no membership", held.status === 200 && held.json?.status === "held"
    && sql(`select count(*) from public.golf_trip_members where profile_id = ${q(newcomer.id)}`) === "0", JSON.stringify(held.json));
  check("ineligible can't even reach the invite API", (await gate(`/api/golf-trips/invitations/${token}`, { token: kidFresh, method: "POST" })).body?.code === "not_eligible");
  activate(newcomer); // activation via the same database function Finish uses; held invitation accepted inside it
  check("after Finish: joined exactly once", sql(`select count(*) from public.golf_trip_members where profile_id = ${q(newcomer.id)} and invitation_status = 'accepted'`) === "1");
  const fin = await call(browser(), finishPOST, "/api/account/finish", {}, { headers: { authorization: `Bearer ${newcomer.token}` } });
  check("Finish again -> already, no second membership", fin.json?.already === true && sql(`select count(*) from public.golf_trip_members where profile_id = ${q(newcomer.id)}`) === "1");
  check("host's organizer row and the kid's locked membership unchanged", sql(`select role || ':' || coalesce(profile_id::text, '') from public.golf_trip_members where golf_trip_id = ${q(tripId)} and role = 'organizer'`) === `organizer:${host.id}`
    && sql(`select count(*) from public.golf_trip_members where profile_id = ${q(kid.id)}`) === "1");
  // The accept route reads the BROWSER session (cookie) — app tokens aren't supported there yet (pre-existing).
  const takeover = await call(active.jar, invitePOST, `/api/golf-trips/invitations/${token}`, {}, { params: { token } });
  check("an already-claimed invitation can't be taken over (409)", takeover.status === 409, JSON.stringify(takeover.json));
  check("...and it still belongs to the newcomer", sql(`select count(*) from public.golf_trip_members where profile_id = ${q(active.id)} and golf_trip_id = ${q(tripId)}`) === "0");
  check("golf records otherwise unchanged by the gate", before.length > 0);
}

section("Database enforcement (account_activation_enforcement.sql applied to this isolated stack)");
{
  // Its stated prerequisites (setup.mjs doesn't install these two feature files), then the enforcement itself.
  psql("supabase/profile_friends.sql");
  psql("supabase/profile_read_model.sql");
  psql("supabase/account_activation_enforcement.sql");
  psql("supabase/account_activation_enforcement.sql"); // safe to run twice
  const rest = async (token: string, path: string) => (await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: status.ANON_KEY, authorization: `Bearer ${token}` } })).status;
  const restRows = async (token: string, path: string) => {
    const r = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: status.ANON_KEY, authorization: `Bearer ${token}` } });
    return r.status === 200 ? ((await r.json()) as unknown[]).length : -r.status;
  };
  check("Active token: own profile readable", await rest(await freshToken(active), `profiles?select=id&id=eq.${active.id}`) === 200);
  check("Pending token: own profile still readable (onboarding needs it)", await rest(await freshToken(pending), `profiles?select=id&id=eq.${pending.id}`) === 200);
  // Ineligible / restricted tokens see NO rows (row-level block) but remain verifiable, so correction and deletion work.
  const kidToken = await freshToken(kid);
  check("Ineligible token: reads no rows, not even its own profile", await restRows(kidToken, `profiles?select=id&id=eq.${kid.id}`) === 0);
  check("Ineligible token: can't see trips or members", await restRows(kidToken, "golf_trip_members?select=id") <= 0 && await restRows(kidToken, "golf_trips?select=id") <= 0);
  check("restricted token: reads no rows", await restRows(await freshToken(restricted), `profiles?select=id&id=eq.${restricted.id}`) === 0);
  const token = `enf-db-${randomUUID()}`;
  sql(`select public.invite_golf_trip_member(${q(host.id)}, ${q(tripId)}, '{"displayName":"Direct"}'::jsonb, ${q(token)})`);
  let refused = false;
  try { sql(`select public.accept_golf_trip_invitation(${q(pending.id)}, ${q(token)})`); } catch (e) { refused = /Finish setting up/.test(String((e as { stderr?: Buffer }).stderr ?? e)); }
  check("Pending can't be attached to a trip even through the database function directly", refused);
  let kidRefused = false;
  try { sql(`insert into public.scoring_group_players (group_id, profile_id, play_order) select id, ${q(kid.id)}, 9 from public.scoring_groups limit 1`); kidRefused = sql("select count(*) from public.scoring_groups") === "0"; }
  catch (e) { kidRefused = /Finish setting up/.test(String((e as { stderr?: Buffer }).stderr ?? e)); }
  check("Ineligible can't be added to scoring", kidRefused);
  check("legacy (activated, no birthday) can still be recorded by an organizer", (() => { try { sql(`insert into public.golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values (${q(tripId)}, ${q(legacy.id)}, 'Legacy', 'member', 'accepted')`); return true; } catch { return false; } })());
  const search = JSON.parse(sql(`select public.search_golfers(${q(active.id)}, 'golfer')`)) as Json[];
  const ids = search.map((g) => g.id);
  check("search shows Active, hides Pending / legacy-needs-birthday / restricted / Ineligible", ids.includes(host.id) && ![pending.id, legacy.id, restricted.id, kid.id].some((id) => ids.includes(id)), JSON.stringify(ids.length));
  sql(`update public.profiles set rounds_visibility = 'public' where id in (${q(host.id)}, ${q(pending.id)})`);
  check("public profile of an Active golfer viewable; a Pending one isn't", JSON.parse(sql(`select public.get_profile_history(${q(active.id)}, ${q(host.id)})`)).restricted === false
    && JSON.parse(sql(`select public.get_profile_history(${q(active.id)}, ${q(pending.id)})`)).restricted === true);
}

section("Deletion and correction stay possible for Pending / restricted / Ineligible with everything on");
{
  const { requestAccountDeletion } = await import("../../lib/account/accountDeletion.ts");
  const leaving = await person("enf-leaving");
  const req = new Request("http://127.0.0.1:3999/api/account/delete", { method: "POST", headers: { authorization: `Bearer ${await freshToken(leaving)}` } });
  check("a Pending account can still delete itself", (await requestAccountDeletion(req)).status === "ok");
  const c = await call(browser(), (await import("../../app/api/account/birthday-correction/route.ts")).POST, "/api/account/birthday-correction", { reason: "wrong year" },
    { headers: { authorization: `Bearer ${await freshToken(kid)}` } });
  check("an Ineligible (locked) account can still ask for a correction", c.status === 200 || c.json?.code === "already_open", JSON.stringify(c.json));
}

flag(false);
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
