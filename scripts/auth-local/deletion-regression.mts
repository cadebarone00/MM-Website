// Accounts V2 Step 3 — account deletion end to end on the ISOLATED local Supabase. Exits non-zero on any failed check.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/deletion-regression.mts
// Real Supabase Auth (hard delete), PostgREST, Storage and the app's server code (lib/account/accountDeletion.ts).
// Covers: recent re-authentication, own-account only, old JWTs blocked immediately (REST, RPC, Storage, app),
// shared data intact, hand-off / archive / restrict, storage files removed, failure injection + resume at every
// step, concurrent runs, orphan and incomplete accounts, re-signup, and V1 rows untouched.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { addr, admin, anon, API, authVersion, runId, browser, call, confirmByEmail, openLink, profile, q, account, requestCount, sql, status, type Jar } from "./harness.mts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { GET: passwordSessionGET, POST: passwordSessionPOST } = await import("../../app/api/auth/password-session/route.ts");
const { requestAccountDeletion, processAccountDeletion, resumeAccountDeletions } = await import("../../lib/account/accountDeletion.ts");
type Options = Parameters<typeof requestAccountDeletion>[1];

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const BUCKET = "deletion-probe";
await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
sql(`drop policy if exists deletion_probe_insert on storage.objects;
     create policy deletion_probe_insert on storage.objects for insert to authenticated with check (bucket_id = '${BUCKET}');
     drop policy if exists deletion_probe_select on storage.objects;
     create policy deletion_probe_select on storage.objects for select to authenticated using (bucket_id = '${BUCKET}' and owner_id = auth.uid()::text);`);

const asToken = (token: string) => createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
async function golfer(name: string, complete = true) {
  const email = addr(name), password = "deletion-password-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  const id = account(email)!.id;
  if (complete) sql(`update public.profiles set username = ${q(`${name.replace(/-/g, "_")}_${Date.now() % 100000}`)}, display_name = ${q(`Real ${name}`)} where id = ${q(id)}`);
  const session = (await anon().auth.signInWithPassword({ email, password })).data.session!;
  return { email, password, id, jar, session };
}
const freshToken = async (u: { email: string; password: string }) => (await anon().auth.signInWithPassword({ email: u.email, password: u.password })).data.session!;
/** What the deletion route will do: the person's own bearer token, nothing else. */
const deleteAs = (token: string, options: Options = {}, body: unknown = {}) =>
  requestAccountDeletion(new Request("http://127.0.0.1:3999/api/account/delete", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), options);
const ledger = (id: string) => sql(`select coalesce((select state from public.account_deletions where account_id = ${q(id)}), '<none>')`);
async function makeTrip(organizer: string, past = false) {
  const draft = { requestId: randomUUID(), tripName: "Deletion Trip", destination: "Pinehurst, NC", startDate: past ? "2024-04-22" : "2027-04-22", endDate: past ? "2024-04-26" : "2027-04-26",
    playerCount: "8", yourName: "Org", yourEmail: "org@example.com", golfDays: "1", day1Date: past ? "2024-04-23" : "2027-04-23", day1Rounds: "1", round1Course: "",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  return ((await admin.rpc("create_golf_trip", { p_profile: organizer, p_input: payload })).data as { tripId: string }).tripId;
}
async function join(organizer: string, trip: string, member: string) {
  const token = `local-deletion-invite-${randomUUID()}`;
  await admin.rpc("invite_golf_trip_member", { p_profile: organizer, p_trip: trip, p_input: { displayName: "Typed Name", email: `typed-${randomUUID().slice(0, 8)}@example.com` }, p_token: token });
  await admin.rpc("accept_golf_trip_invitation", { p_profile: member, p_token: token });
}

console.log(`Supabase Auth ${await authVersion()} (isolated, ${API}). Step 3 installed: ${sql("select to_regclass('public.account_deletions') is not null")}; pre-request hook: ${sql("select coalesce((select array_to_string(setconfig, ',') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator'), 'none')")}`);

// V1-style data that nothing here may touch.
const v1 = await admin.auth.admin.createUser({ email: addr("v1"), password: "v1-password-1", email_confirm: false });
const v1Slug = sql("select player_slug from public.player_slots where claimed_by is null and claim_locked_at is null order by player_slug limit 1");
sql(`insert into public.profiles (id, email, display_name, username, player_slug) values (${q(v1.data.user!.id)}, ${q(addr("v1"))}, 'V1 Player', ${q(`v1_player_${runId}`)}, ${q(v1Slug)});
     update public.player_slots set claimed_by = ${q(v1.data.user!.id)} where player_slug = ${q(v1Slug)};`);
const v1Before = sql(`select row_to_json(p)::text from public.profiles p where id = ${q(v1.data.user!.id)}`) + sql(`select claimed_by from public.player_slots where player_slug = ${q(v1Slug)}`);

section("Setup: A organizes 3 trips (B accepted a hand-off on one), has files, a legacy claim, a live session");
const A = await golfer("alpha"), B = await golfer("bravo"), C = await golfer("charlie");
const tTransfer = await makeTrip(A.id), tActive = await makeTrip(A.id), tPast = await makeTrip(A.id, true);
for (const t of [tTransfer, tActive, tPast]) { await join(A.id, t, B.id); await join(A.id, t, C.id); }
await admin.rpc("offer_golf_trip_organizer", { p_profile: A.id, p_trip: tTransfer, p_to_profile: B.id });
await admin.rpc("accept_golf_trip_organizer", { p_profile: B.id, p_trip: tTransfer });
await admin.rpc("offer_golf_trip_organizer", { p_profile: A.id, p_trip: tActive, p_to_profile: C.id }); // never accepted
const aSlug = sql("select player_slug from public.player_slots where claimed_by is null and claim_locked_at is null order by player_slug limit 1");
sql(`update public.player_slots set claimed_by = ${q(A.id)} where player_slug = ${q(aSlug)}; update public.profiles set player_slug = ${q(aSlug)} where id = ${q(A.id)};`);
const group = sql(`insert into public.scoring_groups (source, golf_trip_id, golf_trip_round_id, group_number, created_by)
  select 'trip', ${q(tActive)}, id, 1, ${q(A.id)} from public.golf_trip_rounds where golf_trip_id = ${q(tActive)} limit 1 returning id`).split("\n")[0];
if (group) sql(`insert into public.scoring_group_players (group_id, profile_id, play_order) values (${q(group)}, ${q(A.id)}, 1), (${q(group)}, ${q(B.id)}, 2)`);
const upload = await asToken(A.session.access_token).storage.from(BUCKET).upload(`${A.id}/note.txt`, new Blob(["mine"]), { upsert: true });
await admin.storage.from("profile-photos").upload(`${A.id}/1.jpg`, new Blob(["jpeg"], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
check("setup: A's own upload + server-stored profile photo", !upload.error && sql(`select count(*) from public.list_account_storage_objects(${q(A.id)})`) === "2", upload.error?.message);
const othersBefore = sql(`select md5(string_agg(row_to_json(x)::text, '|' order by x.id)) from (select * from public.profiles where id not in (${q(A.id)})) x`);
const sharedBefore = sql(`select count(*) from public.scoring_group_players`) + "/" + sql(`select count(*) from public.golf_trip_members`);

section("Re-authentication and own-account only");
{
  const stale = await deleteAs(A.session.access_token, { nowSeconds: Math.floor(Date.now() / 1000) + 3600 });
  check("a session older than 10 minutes is refused (reauth-required)", stale.status === "reauth-required" && ledger(A.id) === "<none>", JSON.stringify(stale));
  (globalThis as { __authLocalJar?: Jar }).__authLocalJar = browser(); // a browser with no cookies at all
  const none = await requestAccountDeletion(new Request("http://127.0.0.1:3999/api/account/delete", { method: "POST" }));
  check("no session: refused", none.status === "signed-out" && ledger(C.id) === "<none>");
  const forged = await deleteAs("not.a.token");
  check("a forged token: refused", forged.status === "signed-out");
}

section("Request: A is blocked everywhere at once (database step done, storage step fails by injection)");
const fresh = await freshToken(A);
{
  const r = await deleteAs(fresh.access_token, { failAt: "storage" }, { accountId: B.id, profileId: C.id });
  check("request accepted for A only; body ids ignored", r.status === "ok" && ledger(A.id) === "database_done" && ledger(B.id) === "<none>" && ledger(C.id) === "<none>", JSON.stringify(r));
  const oldRest = await asToken(A.session.access_token).from("profiles").select("id").eq("id", A.id);
  check("old JWT, REST table read: refused", !!oldRest.error || (oldRest.data ?? []).length === 0, oldRest.error?.message ?? `${oldRest.data?.length} rows`);
  const oldRpc = await asToken(A.session.access_token).rpc("is_golf_trip_member", { p_trip: tActive, p_profile: A.id });
  check("old JWT, RPC call: refused by the pre-request check", !!oldRpc.error, oldRpc.error?.message ?? "allowed");
  const oldRead = await asToken(A.session.access_token).storage.from(BUCKET).download(`${A.id}/note.txt`);
  check("old JWT, Storage read: refused", !!oldRead.error);
  const oldWrite = await asToken(A.session.access_token).storage.from(BUCKET).upload(`${A.id}/again.txt`, new Blob(["x"]), { upsert: true });
  check("old JWT, Storage write: refused", !!oldWrite.error);
  const refresh = await anon().auth.refreshSession({ refresh_token: A.session.refresh_token });
  check("old refresh token: refused", !!refresh.error);
  const app = await call(A.jar, passwordSessionGET, "/api/auth/password-session", undefined, { method: "GET" });
  check("app cookie session: signed out", app.status === 401, `${app.status}`);
  const init = await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: `Bearer ${fresh.access_token}` } });
  check("app bearer pathway: refused", init.status === 401 || init.status === 403, `${init.status}`);
  const relogin = await anon().auth.signInWithPassword({ email: A.email, password: A.password });
  const reloggedRest = relogin.data.session ? await asToken(relogin.data.session.access_token).from("profiles").select("id").eq("id", A.id) : null;
  check("signing in again before the login is gone still can't reach anything", !relogin.data.session || !!reloggedRest?.error || (reloggedRest?.data ?? []).length === 0);
  const bRest = await asToken(B.session.access_token).from("profiles").select("id").eq("id", B.id);
  check("B's token still works", !bRest.error && bRest.data?.length === 1, bRest.error?.message);
  check("storage step failure recorded, files still there", sql(`select attempts || ':' || last_error from public.account_deletions where account_id = ${q(A.id)}`) === "1:injected_storage");
}

section("Database step results (shared data intact)");
{
  const organizer = (t: string) => sql(`select coalesce(string_agg(profile_id::text, ','), '<none>') from public.golf_trip_members where golf_trip_id = ${q(t)} and role = 'organizer'`);
  check("accepted hand-off: B now organizes", organizer(tTransfer) === B.id);
  check("never-accepted offer: nobody was made organizer, trip restricted", organizer(tActive) === "<none>" && sql(`select ownership_state from public.golf_trips where id = ${q(tActive)}`) === "restricted");
  check("past trip archived", sql(`select ownership_state from public.golf_trips where id = ${q(tPast)}`) === "archived");
  const p = profile(A.id);
  check("A's profile is a tombstone", !!p && p.username === null && p.displayName === null && p.playerSlug === null && sql(`select email from public.profiles where id = ${q(A.id)}`) === "", JSON.stringify(p));
  check("A's legacy claim released", sql(`select coalesce(claimed_by::text, '<null>') from public.player_slots where player_slug = ${q(aSlug)}`) === "<null>");
  check("A's trip memberships read 'Former member'", sql(`select string_agg(distinct display_name, ',') from public.golf_trip_members where profile_id = ${q(A.id)}`) === "Former member");
  check("scores and memberships stay (counts unchanged)", sql(`select count(*) from public.scoring_group_players`) + "/" + sql(`select count(*) from public.golf_trip_members`) === sharedBefore);
  check("no other profile changed", sql(`select md5(string_agg(row_to_json(x)::text, '|' order by x.id)) from (select * from public.profiles where id not in (${q(A.id)})) x`) === othersBefore);
}

section("Resume: Auth deletes the login but the run is interrupted before recording it; the retry finishes");
{
  const s1 = await processAccountDeletion(A.id, { failAt: "auth-after-delete" });
  check("interrupted after the hard delete", s1 === "storage_done" && sql(`select count(*) from auth.users where id = ${q(A.id)}`) === "0", s1);
  check("files removed by the storage step", sql(`select count(*) from public.list_account_storage_objects(${q(A.id)})`) === "0");
  const s2 = await processAccountDeletion(A.id);
  check("retry completes ('user not found' counts as done)", s2 === "completed", s2);
  check("profile row kept as an anonymous tombstone, no login behind it", !!profile(A.id) && sql(`select count(*) from auth.users where id = ${q(A.id)}`) === "0");
  const events = sql(`select string_agg(step || ':' || outcome || ':' || detail::text, ' | ' order by id) from public.account_deletion_events where account_id = ${q(A.id)}`);
  check("deletion log holds steps and counts only (no email)", !events.includes("@") && events.includes("database:ok"), events.slice(0, 160));
  const again = await call(browser(), signupPOST, "/api/auth/signup", { email: A.email, password: "new-person-password-1" });
  const newId = account(A.email)?.id;
  check("the same email can sign up again as a NEW account", again.status === 200 && !!newId && newId !== A.id);
}

section("Website cookie session (no bearer token) deletes only the signed-in person");
{
  const F = await golfer("foxtrot");
  await call(F.jar, loginPOST, "/api/auth/login", { usernameOrEmail: F.email, password: F.password }); // fresh sign-in
  (globalThis as { __authLocalJar?: Jar }).__authLocalJar = F.jar;
  const r = await requestAccountDeletion(new Request("http://127.0.0.1:3999/api/account/delete", { method: "POST", body: JSON.stringify({ accountId: B.id }) }));
  check("cookie session: only that person is deleted", r.status === "ok" && r.state === "completed" && ledger(F.id) === "completed" && ledger(B.id) === "<none>", JSON.stringify(r));
}

section("Failure injection at the database step, and a concurrent second run");
{
  const D = await golfer("delta");
  const r = await deleteAs((await freshToken(D)).access_token, { failAt: "database" });
  check("database step failed: account closed, nothing scrubbed yet", r.status === "ok" && ledger(D.id) === "requested" && profile(D.id)?.displayName === "Real delta");
  const [x, y] = await Promise.all([processAccountDeletion(D.id), processAccountDeletion(D.id)]);
  check("two runs at once both end completed", x === "completed" && y === "completed", `${x}/${y}`);
  check("login gone", sql(`select count(*) from auth.users where id = ${q(D.id)}`) === "0");
}

section("Failure injection at the auth step, finished by the retry sweeper");
{
  const E = await golfer("echo", false); // incomplete profile
  const r = await deleteAs((await freshToken(E)).access_token, { failAt: "auth" });
  check("incomplete profile: database + storage done, auth step failed", r.status === "ok" && ledger(E.id) === "storage_done");
  const swept = await resumeAccountDeletions();
  check("sweeper finishes it", swept.some((s) => s.accountId === E.id && s.state === "completed") && sql(`select count(*) from auth.users where id = ${q(E.id)}`) === "0", JSON.stringify(swept));
}

section("A verified login with no profile (like production's 2 orphans)");
{
  const orphanEmail = addr("orphan");
  await admin.auth.admin.inviteUserByEmail(orphanEmail);
  const fragment = new URLSearchParams(new URL(await openLink(orphanEmail, "invite")).hash.slice(1));
  sql(`delete from public.profiles where false`); // (no profile is ever created for it below)
  const orphanId = account(orphanEmail)!.id;
  const linkToken = fragment.get("access_token")!;
  check("orphan has no profile", !profile(orphanId));
  // Phase A2: an invite / reset link is not a "confirm it's you" sign-in. A link-only account sets a password first
  // (forgot password), then deletes with it.
  const linkOnly = await deleteAs(linkToken);
  check("an invite-link session alone can't confirm deletion", linkOnly.status === "reauth-required" && ledger(orphanId) === "<none>", JSON.stringify(linkOnly));
  await admin.auth.admin.updateUserById(orphanId, { password: "orphan pass phrase 1" }); // stands in for the forgot-password email
  const token = (await anon().auth.signInWithPassword({ email: orphanEmail, password: "orphan pass phrase 1" })).data.session!.access_token;
  const r = await deleteAs(token);
  check("orphan deletion completes", r.status === "ok" && r.state === "completed" && sql(`select count(*) from auth.users where id = ${q(orphanId)}`) === "0", JSON.stringify(r));
  check("and no profile was created for it", !profile(orphanId));
  void passwordSessionPOST;
}

section("V1 data untouched");
check("V1 profile and claim exactly as before", sql(`select row_to_json(p)::text from public.profiles p where id = ${q(v1.data.user!.id)}`) + sql(`select claimed_by from public.player_slots where player_slug = ${q(v1Slug)}`) === v1Before);

console.log(`\n${passed} passed, ${failed} failed. ${requestCount()} network requests, all to 127.0.0.1.`);
process.exit(failed ? 1 : 0);
