// Pending accounts Phase 4: under-13 / Ineligible handling — session revocation, safe cleanup (remove vs lock), retries,
// races and corrections — through the REAL birthday route, lib/account/ineligibleAccounts.ts and the existing deletion
// workflow, against the ISOLATED local Supabase with real sessions and tokens.
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/ineligible-regression.mts
// Installs supabase/account_activation.sql on the isolated stack only (activation switch untouched; it isn't needed).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { addr, admin, anon, API, browser, call, confirmByEmail, account, q, sql, status, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: setupPOST } = await import("../../app/api/account/profile/route.ts");
const { POST: birthdayPOST } = await import("../../app/api/account/birthday/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");
const { POST: correctionPOST } = await import("../../app/api/account/birthday-correction/route.ts");
const { GET: cronGET } = await import("../../app/api/internal/account-deletions/route.ts");
const { restrictAndCleanUpIneligible, resumeIneligibleCleanups } = await import("../../lib/account/ineligibleAccounts.ts");
const { resumeAccountDeletions } = await import("../../lib/account/accountDeletion.ts");

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
type Json = Record<string, unknown>;
const ymd = (yearsBack: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - yearsBack); return d.toISOString().slice(0, 10); };
const noPrivate = (x: unknown, ...secrets: string[]) => { const t = JSON.stringify(x); return !/\d{4}-\d{2}-\d{2}/.test(t) && !/@/.test(t) && secrets.every((s) => !t.includes(s)); };

execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("supabase/account_activation.sql") });

async function person(name: string) {
  const email = addr(name), password = "ineligible-pass-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  await call(jar, setupPOST, "/api/account/profile", { displayName: `${name} Golfer`, username: `${name.replace(/-/g, "_")}_${Date.now() % 100000}` });
  const session = (await anon().auth.signInWithPassword({ email, password })).data.session!;
  return { id: account(email)!.id, email, password, jar, token: session.access_token, refresh: session.refresh_token };
}
/** Does an access token still work? Supabase Auth (/user) and the database REST API, separately. */
async function tokenWorks(token: string) {
  const user = await anon().auth.getUser(token);
  const rest = await fetch(`${API}/rest/v1/profiles?select=id`, { headers: { apikey: status.ANON_KEY, authorization: `Bearer ${token}` } });
  return { auth: !user.error, rest: rest.status === 200 };
}
const refreshWorks = async (refresh: string) => !(await anon().auth.refreshSession({ refresh_token: refresh })).error;
const sessionsOf = (id: string) => Number(sql(`select count(*) from auth.sessions where user_id = ${q(id)}`));
const resume = (jar: Jar, token?: string) => call(jar, onboardingGET as never, "/api/account/onboarding", undefined, { method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {} });
const deletionState = (id: string) => sql(`select coalesce((select state from public.account_deletions where account_id = ${q(id)}), '<none>')`);
async function trip(organizer: string) {
  const draft = { tripName: "Kid Check Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", yourName: "Org",
    yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no",
    knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no", requestId: randomUUID() };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  return JSON.parse(sql(`select public.create_golf_trip(${q(organizer)}, ${q(JSON.stringify(payload))}::jsonb)`)).tripId as string;
}
const tripRows = (tripId: string) => sql(`select md5(string_agg(row_to_json(x)::text, '|' order by x.id)) from (select id, golf_trip_id, profile_id, role, invitation_status, display_name from public.golf_trip_members where golf_trip_id = ${q(tripId)}) x`)
  + sql(`select md5(row_to_json(t)::text) from (select id, created_by, name, ownership_state from public.golf_trips where id = ${q(tripId)}) t`);

const bystander = await person("kid-bystander");
const bystanderBefore = sql(`select md5(row_to_json(p)::text) from public.profiles p where id = ${q(bystander.id)}`);

section("New under-13 account with no records: revoked at once, then safely removed");
{
  const kid = await person("kid-clean");
  const oldJar: Jar = new Map(kid.jar);
  check("setup: the kid has live sessions and working tokens", sessionsOf(kid.id) >= 2 && (await tokenWorks(kid.token)).rest);
  const r = await call(kid.jar, birthdayPOST, "/api/account/birthday", { birthdate: ymd(9) });
  check("birthday -> 200 { eligible: false, next: ineligible, signedOut: true }", r.status === 200 && r.json?.eligible === false && r.json?.signedOut === true && r.json?.next === "ineligible", JSON.stringify(r.json));
  check("reply has no date, email or name", noPrivate(r.json, kid.email, "kid-clean"));
  check("every session row gone", sessionsOf(kid.id) === 0);
  const t = await tokenWorks(kid.token);
  check("OLD Bearer access token refused by Supabase Auth", !t.auth);
  check("OLD Bearer access token refused by the database REST API", !t.rest);
  check("OLD refresh token can't mint new tokens", !(await refreshWorks(kid.refresh)));
  const viaOldCookie = await resume(oldJar);
  check("OLD browser cookie -> signed out (401)", viaOldCookie.status === 401, JSON.stringify(viaOldCookie.json));
  check("this browser's cookies were cleared", ![...kid.jar.keys()].some((k) => k.includes("auth-token")) || (await resume(kid.jar)).status === 401);
  check("removal workflow completed (one deletion job)", deletionState(kid.id) === "completed" && sql(`select count(*) from public.account_deletions where account_id = ${q(kid.id)}`) === "1");
  check("login hard-deleted (no auth user, no identities)", sql(`select count(*) from auth.users where id = ${q(kid.id)}`) === "0" && sql(`select count(*) from auth.identities where user_id = ${q(kid.id)}`) === "0");
  check("profile kept only as an anonymous tombstone", sql(`select deleted_at is not null and username is null and display_name is null and email = '' and avatar_path is null from public.profiles where id = ${q(kid.id)}`) === "t");
  check("birthdate, eligibility, Terms, invitations, correction rows all gone",
    ["account_birthdates", "account_eligibility", "terms_acceptances", "pending_invitations", "birthdate_corrections"].every((t) => sql(`select count(*) from public.${t} where account_id = ${q(kid.id)}`) === "0"));
  check("can't sign in again (login gone)", !!(await anon().auth.signInWithPassword({ email: kid.email, password: kid.password })).error);
}

section("Ineligible account with records: locked for review, records preserved, can still ask for a correction");
{
  const org = await person("kid-org");
  const tripId = await trip(org.id);
  const token = `kid-invite-secret-${randomUUID()}`;
  sql(`select public.invite_golf_trip_member(${q(org.id)}, ${q(tripId)}, '{"displayName":"Junior"}'::jsonb, ${q(token)})`);
  const kid = await person("kid-member");
  sql(`select public.accept_golf_trip_invitation(${q(kid.id)}, ${q(token)})`); // allowed today (Phase 5 changes that)
  const before = tripRows(tripId);
  const r = await call(browser(), birthdayPOST, "/api/account/birthday", { birthdate: ymd(11) }, { headers: { authorization: `Bearer ${kid.token}` } });
  check("Bearer birthday -> eligible false, signedOut", r.status === 200 && r.json?.eligible === false && r.json?.signedOut === true, JSON.stringify(r.json));
  check("old Bearer token dead (Auth + REST)", Object.values(await tokenWorks(kid.token)).every((v) => !v));
  check("old cookie dead", (await resume(kid.jar)).status === 401);
  check("LOCKED, not deleted", sql(`select cleanup_state || '|' || array_to_string(review_reasons, ',') from public.account_eligibility where account_id = ${q(kid.id)}`) === "locked|trip_membership"
    && deletionState(kid.id) === "<none>");
  check("organizer and membership rows unchanged", tripRows(tripId) === before);
  check("login still exists (so a correction can be requested)", sql(`select count(*) from auth.users where id = ${q(kid.id)}`) === "1");
  const fresh = (await anon().auth.signInWithPassword({ email: kid.email, password: kid.password })).data.session!.access_token;
  const again = await resume(browser(), fresh);
  check("signing in again -> ineligible, never play", again.json?.state === "ineligible" && again.json?.next === "ineligible", JSON.stringify(again.json));
  check("Finish still refused (403 not_eligible)", (await call(browser(), finishPOST, "/api/account/finish", {}, { headers: { authorization: `Bearer ${fresh}` } })).json?.code === "not_eligible");
  check("no self-service birthday change", (await call(browser(), birthdayPOST, "/api/account/birthday", { birthdate: "1990-01-01" }, { headers: { authorization: `Bearer ${fresh}` } })).json?.code === "not_eligible");
  const c = await call(browser(), correctionPOST, "/api/account/birthday-correction", { reason: "Parent typed the wrong year" }, { headers: { authorization: `Bearer ${fresh}` } });
  check("correction request accepted", c.status === 200 && c.json?.status === "received", JSON.stringify(c.json));
  check("duplicate correction refused", (await call(browser(), correctionPOST, "/api/account/birthday-correction", { reason: "again" }, { headers: { authorization: `Bearer ${fresh}` } })).json?.code === "already_open");
}

section("Existing ACTIVE account corrected to under 13 by an admin: revoked, locked, history kept");
{
  sql(`update public.account_activation_settings set activation_enabled = true;
    insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
    on conflict (document) do update set current_version = excluded.current_version;`);
  const adminUser = await person("kid-admin");
  sql(`update public.profiles set platform_role = 'admin' where id = ${q(adminUser.id)}`);
  const vet = await person("kid-veteran");
  sql(`select public.set_my_birthdate(${q(vet.id)}, '1995-01-01'); select public.record_terms_acceptance(${q(vet.id)}, 'terms', 'local-test', 'signup');
    select public.record_terms_acceptance(${q(vet.id)}, 'privacy', 'local-test', 'signup');`);
  check("veteran activated", JSON.parse(sql(`select public.activate_my_profile(${q(vet.id)})`)).activated === true);
  const tripId = await trip(vet.id);
  const before = tripRows(tripId);
  const c = await call(vet.jar, correctionPOST, "/api/account/birthday-correction", { reason: "My real birthday" });
  check("veteran's correction request accepted", c.status === 200, JSON.stringify(c.json));
  sql(`select public.admin_correct_birthdate(${q(adminUser.id)}, (select id from public.birthdate_corrections where account_id = ${q(vet.id)} and status = 'open'), ${q(ymd(12))}::date, 'verified')`);
  check("admin correction revoked every session at once", sessionsOf(vet.id) === 0 && Object.values(await tokenWorks(vet.token)).every((v) => !v));
  const outcome = await restrictAndCleanUpIneligible(vet.id);
  check("cleanup -> locked (activated + trip owner), never removed", outcome.status === "locked" && (outcome as { blockers: string[] }).blockers.includes("activated")
    && (outcome as { blockers: string[] }).blockers.includes("trip_owner") && deletionState(vet.id) === "<none>", JSON.stringify(outcome));
  check("their trip and organizer row unchanged", tripRows(tripId) === before);
  check("profile identity kept (not tombstoned)", sql(`select deleted_at is null and username is not null from public.profiles where id = ${q(vet.id)}`) === "t");
}

section("Interrupted cleanup, then safe retry (server stopped before deciding; storage step failed)");
{
  const kid = await person("kid-interrupt");
  sql(`select public.set_my_birthdate(${q(kid.id)}, ${q(ymd(10))})`); // marked + revoked, but the server never ran the cleanup
  check("left undecided and listed for the retry job", sql(`select count(*) from public.pending_ineligible_cleanups() where account_id = ${q(kid.id)}`) === "1");
  check("sessions already revoked by the database step alone", sessionsOf(kid.id) === 0);
  const first = await resumeIneligibleCleanups({ deletion: { failAt: "storage" } });
  check("retry job decided it and stopped at the injected storage failure", first.removed >= 1 && deletionState(kid.id) === "database_done", JSON.stringify(first));
  check("already a tombstone (database step done)", sql(`select deleted_at is not null and username is null from public.profiles where id = ${q(kid.id)}`) === "t");
  const again = await restrictAndCleanUpIneligible(kid.id);
  check("re-running the cleanup resumes the SAME deletion (no new job)", again.status === "removed" && deletionState(kid.id) === "completed"
    && sql(`select count(*) from public.account_deletion_events where account_id = ${q(kid.id)} and step = 'requested'`) === "1", JSON.stringify(again));
  await resumeAccountDeletions();
  check("existing deletion retry leaves it completed", deletionState(kid.id) === "completed");
}

section("Concurrent cleanup attempts");
{
  const kid = await person("kid-race");
  sql(`select public.set_my_birthdate(${q(kid.id)}, ${q(ymd(10))})`);
  const outcomes = await Promise.all([restrictAndCleanUpIneligible(kid.id), restrictAndCleanUpIneligible(kid.id), restrictAndCleanUpIneligible(kid.id)]);
  check("all three agree: removed", outcomes.every((o) => o.status === "removed"), JSON.stringify(outcomes.map((o) => o.status)));
  check("exactly one deletion job and one 'requested' event", sql(`select count(*) from public.account_deletions where account_id = ${q(kid.id)}`) === "1"
    && sql(`select count(*) from public.account_deletion_events where account_id = ${q(kid.id)} and step = 'requested'`) === "1");
  check("deletion completed", deletionState(kid.id) === "completed");
}

section("Missing cleanup function: the account is still Ineligible and revoked; the cron job finishes later");
{
  const kid = await person("kid-nofn");
  try {
    sql("alter function public.close_ineligible_registration(uuid, boolean) rename to close_ineligible_registration_hidden; notify pgrst, 'reload schema';");
    await new Promise((r) => setTimeout(r, 2500));
    const r = await call(kid.jar, birthdayPOST, "/api/account/birthday", { birthdate: ymd(10) });
    check("route still answers eligible false + signedOut (controlled)", r.status === 200 && r.json?.eligible === false && r.json?.signedOut === true, JSON.stringify(r.json));
    check("Ineligible and revoked even without the cleanup step", sql(`select public.account_lifecycle_state(${q(kid.id)})`) === "ineligible" && sessionsOf(kid.id) === 0);
    check("cleanup deferred (no deletion yet)", deletionState(kid.id) === "<none>");
  } finally {
    sql("alter function public.close_ineligible_registration_hidden(uuid, boolean) rename to close_ineligible_registration; notify pgrst, 'reload schema';");
    await new Promise((r) => setTimeout(r, 2500));
  }
  process.env.CRON_SECRET = "local-cron-secret-for-tests-only";
  const cron = await cronGET(new Request("http://127.0.0.1:3999/api/internal/account-deletions", { headers: { authorization: "Bearer local-cron-secret-for-tests-only" } }));
  const body = await cron.json() as Json;
  check("cron job (counts only) finished the deferred cleanup", cron.status === 200 && (body.ineligible as Json)?.removed as number >= 1 && deletionState(kid.id) === "completed", JSON.stringify(body));
  check("cron answer has no ids or personal data", noPrivate(body, kid.id));
  const denied = await cronGET(new Request("http://127.0.0.1:3999/api/internal/account-deletions"));
  check("cron job refuses without the secret", denied.status === 401);
}

section("Nobody else affected");
{
  check("bystander's profile byte-identical", sql(`select md5(row_to_json(p)::text) from public.profiles p where id = ${q(bystander.id)}`) === bystanderBefore);
  check("bystander still signed in (token works)", (await tokenWorks(bystander.token)).rest && sessionsOf(bystander.id) >= 1);
  check("bystander not restricted", sql(`select public.account_lifecycle_state(${q(bystander.id)})`) === "pending");
  check("cleanup refuses an account that isn't Ineligible", (await restrictAndCleanUpIneligible(bystander.id)).status === "not_ineligible" && sessionsOf(bystander.id) >= 1);
  const ghost = await restrictAndCleanUpIneligible(randomUUID());
  check("an unknown id does nothing", ghost.status === "not_ineligible" || ghost.status === "failed", JSON.stringify(ghost));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
