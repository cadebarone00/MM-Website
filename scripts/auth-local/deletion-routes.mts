// Accounts V2 Step 3d — the deletion ROUTES, hand-off routes and retry job, end to end on the ISOLATED local Supabase.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/deletion-routes.mts
// Exits non-zero on any failed check. Everything stays on 127.0.0.1.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { addr, admin, anon, API, browser, call, confirmByEmail, profile, q, account, requestCount, sql, status, type Jar } from "./harness.mts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { GET: deleteGET, POST: deletePOST } = await import("../../app/api/account/delete/route.ts");
const { POST: offerPOST, PATCH: answerPATCH, DELETE: withdrawDELETE } = await import("../../app/api/golf-trips/[tripId]/organizer-handoff/route.ts");
const { GET: jobGET } = await import("../../app/api/internal/account-deletions/route.ts");
const { POST: adminInvitePOST } = await import("../../app/api/portal/admin/invite/route.ts");
const { processAccountDeletion } = await import("../../lib/account/accountDeletion.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const ledger = (id: string) => sql(`select coalesce((select state from public.account_deletions where account_id = ${q(id)}), '<none>')`);
const asToken = (token: string) => createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

async function golfer(name: string, complete = true) {
  const email = addr(name), password = "routes-password-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  const id = account(email)!.id;
  if (complete) sql(`update public.profiles set username = ${q(`${name.replace(/-/g, "_")}_${Date.now() % 100000}`)}, display_name = ${q(`Real ${name}`)} where id = ${q(id)}`);
  return { email, password, id, jar };
}
async function makeTrip(organizer: string, past = false) {
  const draft = { requestId: randomUUID(), tripName: past ? "Old Trip" : "Live Trip", destination: "Pinehurst, NC", startDate: past ? "2024-04-22" : "2027-04-22",
    endDate: past ? "2024-04-26" : "2027-04-26", playerCount: "8", yourName: "Org", yourEmail: "org@example.com", golfDays: "1",
    day1Date: past ? "2024-04-23" : "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  return ((await admin.rpc("create_golf_trip", { p_profile: organizer, p_input: payload })).data as { tripId: string }).tripId;
}
async function join(organizer: string, trip: string, member: string) {
  const token = `local-routes-invite-${randomUUID()}`;
  await admin.rpc("invite_golf_trip_member", { p_profile: organizer, p_trip: trip, p_input: { displayName: "Typed Name", email: `typed-${randomUUID().slice(0, 8)}@example.com` }, p_token: token });
  await admin.rpc("accept_golf_trip_invitation", { p_profile: member, p_token: token });
}
const memberId = (trip: string, profileId: string) => sql(`select id from public.golf_trip_members where golf_trip_id = ${q(trip)} and profile_id = ${q(profileId)}`);
const handoff = (jar: Jar, handler: typeof offerPOST, trip: string, body: unknown, method: string) =>
  call(jar, handler as never, `/api/golf-trips/${trip}/organizer-handoff`, body, { method, params: { tripId: trip } });

process.env.CRON_SECRET = "local-test-cron-secret";

section("Setup: A organizes a live trip and an ended trip; B and C joined; A has a legacy claim");
const A = await golfer("alpha"), B = await golfer("bravo"), C = await golfer("charlie");
const live = await makeTrip(A.id), past = await makeTrip(A.id, true), live2 = await makeTrip(A.id);
for (const t of [live, past, live2]) { await join(A.id, t, B.id); await join(A.id, t, C.id); }
const aSlug = sql("select player_slug from public.player_slots where claimed_by is null order by player_slug limit 1");
sql(`update public.player_slots set claimed_by = ${q(A.id)} where player_slug = ${q(aSlug)}; update public.profiles set player_slug = ${q(aSlug)} where id = ${q(A.id)};`);
const tripRound = sql(`select id from public.golf_trip_rounds where golf_trip_id = ${q(live)} limit 1`);
const group = sql(`insert into public.scoring_groups (source, golf_trip_id, golf_trip_round_id, group_number, created_by) values ('trip', ${q(live)}, ${q(tripRound)}, 1, ${q(A.id)}) returning id`).split("\n")[0];
sql(`insert into public.scoring_group_players (group_id, profile_id, play_order) values (${q(group)}, ${q(A.id)}, 1), (${q(group)}, ${q(B.id)}, 2)`);
const bScore = await admin.rpc("save_hole_scores", { p_profile: B.id, p_group: group, p_scored: B.id, p_client_updated_at: new Date().toISOString(), p_entries: [{ hole: 1, strokes: 4 }] });
check("setup: B scores hole 1 in the trip group", !bScore.error, bScore.error?.message);

section("Hand-off routes: only the organizer asks; only the asked member answers; decline is respected");
{
  const notOrganizer = await handoff(B.jar, offerPOST, live, { memberId: memberId(live, C.id) }, "POST");
  check("a member can't hand off the trip (403)", notOrganizer.status === 403, JSON.stringify(notOrganizer.json));
  const offer = await handoff(A.jar, offerPOST, live, { memberId: memberId(live, B.id) }, "POST");
  check("organizer asks B", offer.status === 200, JSON.stringify(offer.json));
  const wrongPerson = await handoff(C.jar, answerPATCH, live, { accept: true }, "PATCH");
  check("C can't accept B's request", wrongPerson.status === 403, JSON.stringify(wrongPerson.json));
  const decline = await handoff(B.jar, answerPATCH, live, { accept: false }, "PATCH");
  check("B declines", decline.status === 200);
  const offer2 = await handoff(A.jar, offerPOST, live2, { memberId: memberId(live2, C.id) }, "POST");
  const accept2 = await handoff(C.jar, answerPATCH, live2, { accept: true }, "PATCH");
  check("on the second live trip C accepts", offer2.status === 200 && accept2.status === 200);
  const bogus = await handoff(A.jar, offerPOST, live, { memberId: randomUUID() }, "POST");
  check("asking a member id from no trip is refused", bogus.status === 400);
  const withdraw = await handoff(A.jar, withdrawDELETE, past, undefined, "DELETE");
  check("withdraw works (even with nothing pending)", withdraw.status === 200);
}

section("Delete route: preview, own account only, re-authentication, confirmation");
{
  const preview = await call(A.jar, deleteGET as never, "/api/account/delete", undefined, { method: "GET" });
  const trips = ((preview.json?.preview as { trips?: { tripId: string; outcome: string }[] })?.trips ?? []);
  const outcome = (t: string) => trips.find((x) => x.tripId === t)?.outcome;
  check("preview: declined → restrict, accepted → transfer, ended → archive", outcome(live) === "restrict" && outcome(live2) === "transfer" && outcome(past) === "archive", JSON.stringify(trips.map((t) => t.outcome)));
  const noConfirm = await call(A.jar, deletePOST as never, "/api/account/delete", { password: A.password });
  check("without typing DELETE: refused, nothing started", noConfirm.status === 400 && ledger(A.id) === "<none>");
  const wrongPassword = await call(A.jar, deletePOST as never, "/api/account/delete", { confirm: "DELETE", password: "not-it" });
  check("wrong password: refused, nothing started", wrongPassword.status === 401 && wrongPassword.json?.reauth === true && ledger(A.id) === "<none>");
  const signedOut = await call(browser(), deletePOST as never, "/api/account/delete", { confirm: "DELETE", password: A.password, accountId: A.id });
  check("signed out (even naming A's id): refused", signedOut.status === 401 && ledger(A.id) === "<none>");
  const otherBody = await call(C.jar, deleteGET as never, "/api/account/delete", undefined, { method: "GET" });
  check("C's preview is C's own (no organized trips)", ((otherBody.json?.preview as { trips?: unknown[] })?.trips ?? []).length === 0);
}

section("Delete route: A deletes (concurrent double-submit), everything confirmed");
const tokenBefore = (await anon().auth.signInWithPassword({ email: A.email, password: A.password })).data.session!.access_token;
{
  const [first, second] = await Promise.all([
    call(A.jar, deletePOST as never, "/api/account/delete", { confirm: "DELETE", password: A.password, accountId: B.id }),
    call(A.jar, deletePOST as never, "/api/account/delete", { confirm: "DELETE", password: A.password }),
  ]);
  const states = [first.json?.state, second.json?.state];
  check("double-submit: both answer, one deletion, completed", states.includes("completed") && ledger(A.id) === "completed" && ledger(B.id) === "<none>", `${first.status}/${second.status} ${JSON.stringify(states)}`);
  check("'completed' only when the login is really gone", sql(`select count(*) from auth.users where id = ${q(A.id)}`) === "0");
  const old = await asToken(tokenBefore).from("profiles").select("id");
  check("A's old token can't read anything", !!old.error || (old.data ?? []).length === 0, old.error?.message);
  check("live trip with a DECLINED request: restricted, no organizer", sql(`select ownership_state from public.golf_trips where id = ${q(live)}`) === "restricted"
    && sql(`select count(*) from public.golf_trip_members where golf_trip_id = ${q(live)} and role = 'organizer'`) === "0");
  check("live trip with an ACCEPTED request: C organizes", sql(`select profile_id from public.golf_trip_members where golf_trip_id = ${q(live2)} and role = 'organizer'`) === C.id);
  check("ended trip archived", sql(`select ownership_state from public.golf_trips where id = ${q(past)}`) === "archived");
  check("A's legacy record unlinked and locked", sql(`select coalesce(claimed_by::text,'<null>') || ':' || coalesce(claim_locked_reason,'') from public.player_slots where player_slug = ${q(aSlug)}`) === "<null>:account_deleted");
}

section("Historical claim lock: nobody can take A's old player record next");
{
  const host = await golfer("host");
  sql(`update public.profiles set is_host = true where id = ${q(host.id)}`);
  await call(host.jar, loginPOST, "/api/auth/login", { usernameOrEmail: host.email, password: host.password });
  sql(`update public.player_slots set email = ${q(addr("claimer"))} where player_slug = ${q(aSlug)}`);
  const invite = await call(host.jar, adminInvitePOST as never, "/api/portal/admin/invite", { playerSlug: aSlug });
  check("admin invite for the locked record is refused BEFORE any email (409)", invite.status === 409 && sql(`select count(*) from public.player_claim_invitations where player_slug = ${q(aSlug)}`) === "0"
    && sql(`select count(*) from auth.users where email = ${q(addr("claimer"))}`) === "0", `${invite.status} ${JSON.stringify(invite.json)}`);
  let direct = "allowed";
  try { sql(`update public.player_slots set claimed_by = ${q(B.id)} where player_slug = ${q(aSlug)}`); } catch { direct = "refused"; }
  check("a direct claim is refused by the database", direct === "refused");
}

section("Everyone else keeps working: scoring, profiles, other accounts");
{
  const next = await admin.rpc("save_hole_scores", { p_profile: B.id, p_group: group, p_scored: B.id, p_client_updated_at: new Date().toISOString(), p_entries: [{ hole: 2, strokes: 5 }] });
  check("B keeps scoring in the restricted trip's group", !next.error, next.error?.message);
  check("B's earlier and new scores both there", sql(`select count(*) from public.hole_score_entries where group_id = ${q(group)} and scored_profile_id = ${q(B.id)}`) === "2");
  check("A's card (tombstone) still in the group so the leaderboard stays correct", sql(`select count(*) from public.scoring_group_players where group_id = ${q(group)}`) === "2");
  const bLogin = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: B.email, password: B.password });
  check("B can still sign in", bLogin.status === 200);
  check("B's and C's profiles untouched", profile(B.id)?.displayName === "Real bravo" && profile(C.id)?.displayName === "Real charlie");
}

section("Retry job: only the cron secret runs it; it finishes interrupted deletions and orphaned files");
{
  const D = await golfer("delta", false);
  const dToken = (await anon().auth.signInWithPassword({ email: D.email, password: D.password })).data.session!.access_token;
  await admin.storage.from("profile-photos").upload(`${D.id}/1.jpg`, new Blob(["jpeg"], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
  const { requestAccountDeletion } = await import("../../lib/account/accountDeletion.ts");
  const started = await requestAccountDeletion(new Request("http://x/", { method: "POST", headers: { authorization: `Bearer ${dToken}` } }), { failAt: "auth" });
  check("interrupted at the auth step (incomplete profile)", started.status === "ok" && ledger(D.id) === "storage_done");
  const asBrowser = await call(B.jar, jobGET as never, "/api/internal/account-deletions", undefined, { method: "GET" });
  check("a signed-in browser can't run the job (401)", asBrowser.status === 401);
  const wrongSecret = await call(browser(), jobGET as never, "/api/internal/account-deletions", undefined, { method: "GET", headers: { authorization: "Bearer wrong" } });
  check("wrong secret: 401", wrongSecret.status === 401);
  // A file that slips in after a deletion finished (e.g. an upload racing the close) is swept too.
  await admin.storage.from("profile-photos").upload(`${A.id}/late.jpg`, new Blob(["late"], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
  const run = await call(browser(), jobGET as never, "/api/internal/account-deletions", undefined, { method: "GET", headers: { authorization: "Bearer local-test-cron-secret" } });
  check("job finishes D and removes the late file", run.status === 200 && ledger(D.id) === "completed" && Number(run.json?.filesRemoved) >= 1
    && sql(`select count(*) from storage.objects where bucket_id = 'profile-photos' and (name like ${q(`${A.id}/%`)} or name like ${q(`${D.id}/%`)})`) === "0", JSON.stringify(run.json));
  check("job answer holds counts only", !JSON.stringify(run.json).includes("@") && !JSON.stringify(run.json).includes(D.id));
  check("running the job again is harmless", (await call(browser(), jobGET as never, "/api/internal/account-deletions", undefined, { method: "GET", headers: { authorization: "Bearer local-test-cron-secret" } })).status === 200
    && await processAccountDeletion(D.id) === "completed");
}

console.log(`\n${passed} passed, ${failed} failed. ${requestCount()} network requests, all to 127.0.0.1.`);
process.exit(failed ? 1 : 0);
