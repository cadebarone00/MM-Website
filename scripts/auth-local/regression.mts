// Accounts V2 (Step 2d) regression tests against the ISOLATED local Supabase. Exits non-zero if any check fails.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/regression.mts
// Runs the app's REAL route handlers. Covers every vulnerability reproduced in Step 2c (S3, S9, S10 deletions, S4
// enumeration, S6 code-only claims, S8 profile-less accounts) plus the V2 flows: verified-only initialization, Finish
// setup, the iOS-style bearer pathway, admin player invitations, trip invites for unfinished profiles, the scoring
// gate, the legacy password trigger, and V1 data staying untouched.
import { randomUUID } from "node:crypto";
import { addr, admin, anon, authVersion, browser, call, confirmByEmail, latestLink, openLink, pastThrottle, profile, q, account,
  requestCount, slot, sql, unclaimedCode, type Jar } from "./harness.mts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { POST: passwordSessionPOST } = await import("../../app/api/auth/password-session/route.ts");
const { POST: adminInvitePOST } = await import("../../app/api/portal/admin/invite/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { POST: setupPOST } = await import("../../app/api/account/profile/route.ts");
const { POST: acceptTripPOST } = await import("../../app/api/golf-trips/invitations/[token]/route.ts");
const { POST: scoringPOST } = await import("../../app/api/golf-trips/[tripId]/scoring/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const signup = (jar: Jar, email: string, password: string, extra: Record<string, unknown> = {}) => call(jar, signupPOST, "/api/auth/signup", { email, password, ...extra });
const login = (jar: Jar, who: string, password: string) => call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: who, password });
const profileCount = () => Number(sql("select count(*) from public.profiles"));
const claimedCount = () => Number(sql("select count(*) from public.player_slots where claimed_by is not null"));
/** Sign up through the app, verify by email, sign in through the app: a finished browser session. */
async function verifiedUser(name: string, password = "password-123") {
  const email = addr(name), jar = browser();
  await signup(jar, email, password);
  await confirmByEmail(email);
  const signedIn = await login(jar, email, password);
  return { email, jar, id: account(email)!.id, signedIn };
}

console.log(`Supabase Auth ${await authVersion()} (isolated, 127.0.0.1:55321). V2 installed: ${sql("select to_regclass('public.player_claim_invitations') is not null")}`);

// --- V1 data that must survive untouched (made like V1 did: admin-invited, unverified, holding a player claim) -------
const [v1Slug] = unclaimedCode();
const v1Email = addr("v1-pending-player");
const v1Invite = await admin.auth.admin.createUser({ email: v1Email, password: "v1-password-1", email_confirm: false });
const v1Id = v1Invite.data.user!.id;
sql(`insert into public.profiles (id, email, display_name, username, player_slug) values (${q(v1Id)}, ${q(v1Email)}, 'V1 Player', 'v1player', ${q(v1Slug)});
     update public.player_slots set claimed_by = ${q(v1Id)} where player_slug = ${q(v1Slug)};`);
const v1Before = sql(`select username || display_name || player_slug from public.profiles where id = ${q(v1Id)}`);

section("Signup creates the login only");
{
  const email = addr("r1-new");
  const before = profileCount();
  const r = await signup(browser(), email, "first-password-1");
  check("new signup answers {ok:true}", r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));
  check("account exists, unverified", account(email)?.confirmed === false);
  check("no profile before verification", !profile(account(email)!.id) && profileCount() === before);
}

section("S3 regression: the same unverified email signing up again never deletes the account");
{
  const email = addr("r2-dupe");
  await signup(browser(), email, "first-password-1");
  const before = account(email)!;
  await pastThrottle();
  const again = await signup(browser(), email, "second-password-2");
  const after = account(email);
  check("answers like a new signup", again.status === 200 && again.json?.ok === true, JSON.stringify(again.json));
  check("original account still there, same id", after?.id === before.id);
  check("password not changed by the second signup", after?.passwordFingerprint === before.passwordFingerprint);
  const immediate = await signup(browser(), email, "third-password-3");
  check("a throttled retry also answers like a new signup", immediate.status === 200 && immediate.json?.ok === true, JSON.stringify(immediate.json));
}

section("S4 regression: a verified email gets the same answer as a new one");
{
  const user = await verifiedUser("r3-verified");
  await pastThrottle();
  const again = await signup(browser(), user.email, "other-password-9");
  check("same {ok:true} answer (no account enumeration)", again.status === 200 && again.json?.ok === true, JSON.stringify(again.json));
  check("account untouched", account(user.email)?.id === user.id);
}

section("Double-submit");
{
  const email = addr("r4-double");
  const replies = await Promise.all([signup(browser(), email, "double-password-1"), signup(browser(), email, "double-password-1")]);
  check("one account exists afterwards", sql(`select count(*) from auth.users where email = ${q(email)}`) === "1", replies.map((r) => r.status).join("/"));
}

section("S6 regression: a player code at signup claims nothing");
{
  const [slug, code] = unclaimedCode();
  const email = addr("r5-code");
  const claimed = claimedCount();
  const r = await signup(browser(), email, "code-password-1", { username: code });
  check("signup still answers {ok:true}", r.status === 200 && r.json?.ok === true);
  check(`player ${code} stays unclaimed`, slot(slug).claimedBy === null && claimedCount() === claimed);
  await confirmByEmail(email);
  const jar = browser();
  await login(jar, email, "code-password-1");
  check("even after verifying + signing in, no claim", slot(slug).claimedBy === null && profile(account(email)!.id)?.playerSlug === null);
}

section("Verified sign-in creates an INCOMPLETE profile; Finish setup completes it once");
{
  const user = await verifiedUser("r6-onboard");
  check("login ok", user.signedIn.status === 200, JSON.stringify(user.signedIn.json));
  const p = profile(user.id);
  check("profile created at first verified sign-in", !!p);
  check("no invented username or name", p?.username === null && p?.displayName === null, JSON.stringify(p));
  const badSetup = await call(user.jar, setupPOST, "/api/account/profile", { displayName: "R Six", username: "x" });
  check("bad username refused", badSetup.status === 400);
  const setup = await call(user.jar, setupPOST, "/api/account/profile", { displayName: "R Six", username: `r6_${Date.now() % 100000}` });
  check("Finish setup completes", setup.status === 200 && setup.json?.ok === true, JSON.stringify(setup.json));
  const done = profile(user.id);
  const again = await call(user.jar, setupPOST, "/api/account/profile", { displayName: "Someone Else", username: "someone_else" });
  check("Finish setup again changes nothing", again.status === 200 && JSON.stringify(profile(user.id)) === JSON.stringify(done));
  const login2 = await login(browser(), user.email, "password-123");
  check("signing in again leaves the profile alone", login2.status === 200 && JSON.stringify(profile(user.id)) === JSON.stringify(done));
}

section("S7 regression: login by username never reveals the email");
{
  const email = addr("r7-unverified");
  await signup(browser(), email, "unverified-password-1");
  sql(`insert into public.profiles (id, email, display_name, username) values (${q(account(email)!.id)}, ${q(email)}, 'Old Style', 'oldstyle_${Date.now() % 100000}')`);
  const handle = sql(`select username from public.profiles where id = ${q(account(email)!.id)}`);
  const byName = await login(browser(), handle, "unverified-password-1");
  check("unverified + username: no email in the reply", byName.json?.unverified === true && byName.json?.email === null, JSON.stringify(byName.json));
  const byEmail = await login(browser(), email, "unverified-password-1");
  check("unverified + typed email: email echoed (they typed it)", byEmail.json?.email === email);
}

section("S8 regression: accounts made outside the app recover through the one pathway (cookie or iOS bearer token)");
{
  const direct = addr("r8-direct");
  await anon().auth.signUp({ email: direct, password: "direct-password-1" });
  const early = await anon().auth.signInWithPassword({ email: direct, password: "direct-password-1" });
  check("unverified account can't even get a token", !early.data.session);
  await confirmByEmail(direct);
  const session = (await anon().auth.signInWithPassword({ email: direct, password: "direct-password-1" })).data.session!;
  const id = account(direct)!.id;
  check("signed in straight with Supabase: no profile yet", !profile(id));
  const other = await verifiedUser("r8-other");
  const r = await call(browser(), initializePOST, "/api/account/initialize", { accountId: other.id, profileId: other.id },
    { headers: { authorization: `Bearer ${session.access_token}` } });
  check("bearer initialize answers ok + incomplete", r.status === 200 && r.json?.complete === false, JSON.stringify(r.json));
  check("profile created for the TOKEN's account", !!profile(id));
  check("body ids are ignored (other account unaffected)", JSON.stringify(profile(other.id)) === JSON.stringify({ username: null, displayName: null, playerSlug: null }));
  const again = await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: `Bearer ${session.access_token}` } });
  check("repeat is safe (created:false)", again.status === 200 && again.json?.created === false);
  const bad = await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: "Bearer not-a-real-token" } });
  check("invalid token refused", bad.status === 401);
  const none = await call(browser(), initializePOST, "/api/account/initialize", {});
  check("no session refused", none.status === 401);
  const invited = addr("r8-dashboard-invite");
  await admin.auth.admin.inviteUserByEmail(invited);
  const fragment = new URLSearchParams(new URL(await openLink(invited, "invite")).hash.slice(1));
  const jar = browser();
  const accepted = await call(jar, passwordSessionPOST, "/api/auth/password-session", { access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token") });
  check("dashboard-style invite: accepting the link creates the profile", accepted.status === 200 && !!profile(account(invited)!.id));
}

section("Admin player invitations (S9, S10, S11 regressions)");
const host = await verifiedUser("host");
sql(`update public.profiles set is_host = true, username = 'host_${Date.now() % 100000}', display_name = 'Host' where id = ${q(host.id)}`); // local test admin
const invitePlayer = async (slug: string, email: string) => {
  sql(`update public.player_slots set email = ${q(email)} where player_slug = ${q(slug)}`);
  return call(host.jar, adminInvitePOST, "/api/portal/admin/invite", { playerSlug: slug });
};
{
  const [slug, code] = unclaimedCode();
  const invited = addr("r9-invited");
  const inv = await invitePlayer(slug, invited);
  const invitedAccount = account(invited)!;
  check("admin invite ok", inv.status === 200, JSON.stringify(inv.json));
  check("no profile and no claim at invite time", !profile(invitedAccount.id) && slot(slug).claimedBy === null);
  await pastThrottle();
  const dupe = await signup(browser(), invited, "someone-else-1");
  check("S9: a signup with the invited email answers like any signup", dupe.status === 200);
  check("S9: the invited account is NOT deleted", account(invited)?.id === invitedAccount.id);
  check("S9: the pending invitation is still bound to it", sql(`select account_id from public.player_claim_invitations where player_slug = ${q(slug)}`) === invitedAccount.id);
  const stranger = addr("r9-stranger");
  await signup(browser(), stranger, "stranger-password-1", { username: code });
  await confirmByEmail(stranger);
  await login(browser(), stranger, "stranger-password-1");
  check(`S9: a stranger with code ${code} gets nothing`, slot(slug).claimedBy === null);
  check("S9: the stranger's signup set no password on the invited account", account(invited)?.passwordFingerprint === invitedAccount.passwordFingerprint);
  check("S9: the stranger can't sign in to it", !(await anon().auth.signInWithPassword({ email: invited, password: "someone-else-1" })).data.session);
  // Supabase's own behavior: the stranger's signup expires the invite link and mails the owner a fresh confirmation.
  // The real owner recovers with that email + "forgot password" (which also exercises the legacy password trigger).
  console.log(`  INFO  old invite link now: ${(await openLink(invited, "invite")).slice(0, 70)}`);
  await openLink(invited, "signup");
  const jar = browser();
  await call(jar, forgotPOST, "/api/auth/forgot-password", { email: invited });
  const code2 = new URL(await openLink(invited, "recovery")).searchParams.get("code");
  const cb = await call(jar, callbackGET, `/auth/callback?code=${code2}`, undefined, { method: "GET" });
  const reset = await call(jar, resetPOST, "/api/auth/reset-password", { password: "owner-password-456" });
  const claimed = profile(invitedAccount.id);
  check("the real owner's verified session completes the claim", slot(slug).claimedBy === invitedAccount.id && claimed?.playerSlug === slug, JSON.stringify(claimed));
  check("claim prefills the real name, never a username", claimed?.username === null && !!claimed?.displayName);
  check("password reset works with the legacy trigger installed", cb.location?.endsWith("/reset-password") === true && reset.status === 200 && slot(slug).passwordCreated, JSON.stringify(reset.json));
  check("owner signs in with the new password", (await login(browser(), invited, "owner-password-456")).status === 200);
}
{ // The normal path: the invitee opens the invite email (nobody interfered) and gets a session.
  const [slug] = unclaimedCode();
  const invited = addr("r9b-invited");
  await invitePlayer(slug, invited);
  const fragment = new URLSearchParams(new URL(await openLink(invited, "invite")).hash.slice(1));
  await call(browser(), passwordSessionPOST, "/api/auth/password-session", { access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token") });
  check("invite link accepted: claim completes right away", slot(slug).claimedBy === account(invited)!.id);
}
{
  const [slug] = unclaimedCode();
  const selfSigned = addr("r10-self");
  await signup(browser(), selfSigned, "self-password-1");
  const before = account(selfSigned)!;
  await pastThrottle();
  const inv = await invitePlayer(slug, selfSigned);
  check("S10: inviting an email with an unverified self-signup does NOT delete it", account(selfSigned)?.id === before.id, `${inv.status} ${JSON.stringify(inv.json)}`);
  check("S10: the claim waits for that account to verify", slot(slug).claimedBy === null);
  await openLink(selfSigned, (await latestLink(selfSigned, "invite").then(() => "invite" as const, () => "signup" as const)));
  const jar = browser();
  await login(jar, selfSigned, "self-password-1");
  check("S10: once that account verifies and signs in, the claim completes", slot(slug).claimedBy === before.id);
}
{
  const [slug] = unclaimedCode();
  const user = await verifiedUser("r11-verified");
  await pastThrottle();
  const inv = await invitePlayer(slug, user.email);
  check("S11: inviting a verified account is refused (409), nothing deleted", inv.status === 409 && account(user.email)?.id === user.id, JSON.stringify(inv.json));
}

section("Golf Trip: an unfinished profile can accept an invite but can't score");
{
  const organizer = await verifiedUser("r12-organizer");
  await call(organizer.jar, setupPOST, "/api/account/profile", { displayName: "Org Anizer", username: `org_${Date.now() % 100000}` });
  const draft = { requestId: randomUUID(), tripName: "Spring Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "8", yourName: "Org", yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  const tripId = ((await admin.rpc("create_golf_trip", { p_profile: organizer.id, p_input: payload })).data as { tripId: string }).tripId;
  const token = `local-test-invite-secret-${randomUUID()}`;
  await admin.rpc("invite_golf_trip_member", { p_profile: organizer.id, p_trip: tripId, p_input: { displayName: "New Golfer", email: null }, p_token: token });
  const half = await verifiedUser("r12-half");
  const accepted = await call(half.jar, acceptTripPOST, `/api/golf-trips/invitations/${token}`, {}, { params: { token } });
  check("unfinished profile accepts the trip invite", accepted.status === 200, JSON.stringify(accepted.json));
  check("membership attached to that profile", sql(`select count(*) from public.golf_trip_members where golf_trip_id = ${q(tripId)} and profile_id = ${q(half.id)}`) === "1");
  const score = await call(half.jar, scoringPOST, `/api/golf-trips/${tripId}/scoring`, { round: 1 }, { params: { tripId } });
  check("scoring refused until setup is finished (409)", score.status === 409, JSON.stringify(score.json));
  let dbRefused = false;
  try {
    const group = sql(`insert into public.scoring_groups (source, group_number, created_by) values ('personal', 1, ${q(organizer.id)}) returning id`).split("\n")[0];
    sql(`insert into public.scoring_group_players (group_id, profile_id, play_order) values (${q(group)}, ${q(half.id)}, 1)`);
  } catch (error) { dbRefused = /Finish setting up your profile/.test(String((error as { stderr?: Buffer }).stderr ?? error)); }
  check("the database also refuses an unfinished profile in a scoring group", dbRefused);
}

section("V1 data preserved");
{
  await pastThrottle();
  await signup(browser(), v1Email, "attacker-password-1");
  check("V1 pending account survives a signup with its email", !!account(v1Email) && account(v1Email)!.id === v1Id);
  check("V1 profile and player claim unchanged", sql(`select username || display_name || player_slug from public.profiles where id = ${q(v1Id)}`) === v1Before && slot(v1Slug).claimedBy === v1Id);
  check("no V2 function or route ever deleted an account", sql("select count(*) from auth.users where deleted_at is not null") === "0");
}

console.log(`\n${passed} passed, ${failed} failed. ${requestCount()} network requests, all to 127.0.0.1.`);
process.exit(failed ? 1 : 0);
