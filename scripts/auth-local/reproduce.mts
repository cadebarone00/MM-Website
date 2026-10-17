// Accounts Step 2c: reproduces the V1 signup behavior (run against V1 routes, 2026-10-16; on the V2 routes it shows the fixes) against the ISOLATED local Supabase (scripts/auth-local/setup.mjs).
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/reproduce.mts
// Runs the app's REAL route handlers (signup, login, forgot/reset password, auth callback) in Node. Every network call
// is checked to be 127.0.0.1; emails land in the local Mailpit inbox; test addresses use the reserved .test domain.
// Nothing reads .env files. It records what happened; a "finding" is not a test failure.
import { addr, admin, anon, authVersion, browser, call as runRoute, confirmByEmail, latestLink, mailCount, MAIL, API, pastThrottle,
  profile, q, account, requestCount, runId as run, slot, sql, unclaimedCode, type Jar } from "./harness.mts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { POST: adminInvitePOST } = await import("../../app/api/portal/admin/invite/route.ts");

// The 2c scenarios were written against the V1 routes; with the V2 routes in place they show the fixed behavior.
const call = (jar: Jar, handler: (r: Request) => Promise<Response>, path: string, body?: unknown, method = "POST") => runRoute(jar, handler, path, body, { method });
const signup = (jar: Jar, email: string, password: string, username?: string) => call(jar, signupPOST, "/api/auth/signup", { email, password, ...(username ? { username } : {}) });
const results: { id: string; title: string; observed: string[]; finding: "REPRODUCED" | "NOT REPRODUCED" | "OK" | "INFO" }[] = [];
const record = (id: string, title: string, finding: (typeof results)[number]["finding"], observed: string[]) => {
  results.push({ id, title, finding, observed });
  console.log(`
[${finding}] ${id}. ${title}`);
  for (const line of observed) console.log(`   - ${line}`);
};

// --- 3. Scenarios ---------------------------------------------------------------------------------------------------
console.log(`Supabase Auth (GoTrue) version: ${await authVersion()}`);
console.log(`Isolated stack ${API}; Mailpit ${MAIL}; run ${run}. Accounts before: ${sql("select count(*) from auth.users")}`);

{ // S1: a normal signup
  const email = addr("s1-new");
  const r = await signup(browser(), email, "first-password-1");
  const a = account(email);
  const p = a && profile(a.id);
  record("S1", "New signup through the app", "INFO", [
    `route answered ${r.status} ${JSON.stringify(r.json)}`,
    `account created: ${!!a}, verified: ${a?.confirmed}`,
    `profile created BEFORE verification: ${!!p} (username "${p?.username}", name "${p?.displayName}")`,
    `confirmation emails in the local inbox: ${await mailCount(email)}`]);
}

{ // S2: what Supabase itself returns (direct signUp, no app code)
  const fresh = addr("s2-raw");
  const one = await anon().auth.signUp({ email: fresh, password: "raw-password-1" });
  const immediate = await anon().auth.signUp({ email: fresh, password: "raw-password-2" });
  await pastThrottle();
  const two = await anon().auth.signUp({ email: fresh, password: "raw-password-2" });
  const realId = account(fresh)!.id;
  await confirmByEmail(fresh);
  await pastThrottle();
  const three = await anon().auth.signUp({ email: fresh, password: "raw-password-3" });
  const describe = (label: string, r: Awaited<ReturnType<ReturnType<typeof anon>["auth"]["signUp"]>>) =>
    `${label}: error=${r.error ? JSON.stringify(r.error.message) : "none"}; user id ${r.data.user ? (r.data.user.id === realId ? "= the REAL account id" : "= a different (fake) id") : "none"}; identities=${r.data.user?.identities?.length ?? "n/a"}; session=${!!r.data.session}`;
  record("S2", "What Supabase returns for new / existing-unverified / existing-verified emails", "INFO", [
    describe("new email", one), describe("same email again within the throttle window", immediate), describe("same email, not yet verified, after the window", two), describe("same email, verified", three),
    `accounts with that email afterwards: ${sql(`select count(*) from auth.users where email = ${q(fresh)}`)}`]);
}

{ // S3: duplicate signup of an UNVERIFIED email through the app (the suspected deletion)
  const email = addr("s3-dupe");
  await signup(browser(), email, "first-password-1");
  const before = account(email)!;
  const profileBefore = profile(before.id);
  const firstLink = await latestLink(email, "signup");
  await pastThrottle();
  const r = await signup(browser(), email, "second-password-2");
  const after = account(email);
  const linkStatus = (await fetch(firstLink, { redirect: "manual" })).headers.get("location") ?? "";
  const deleted = !after;
  record("S3", "Same unverified email signs up again through the app", deleted ? "REPRODUCED" : "NOT REPRODUCED", [
    `first signup: account + profile "${profileBefore?.username}" created`,
    `second signup answered ${r.status} ${JSON.stringify(r.json)}`,
    `original account still exists: ${!deleted}${after ? ` (same id: ${after.id === before.id}; password changed: ${after.passwordFingerprint !== before.passwordFingerprint})` : ""}`,
    `original profile still exists: ${!!profile(before.id)}`,
    `the first verification link now: ${/error/.test(linkStatus) ? "FAILS" : "works"} (${linkStatus.slice(0, 90)})`]);
}

{ // S4: duplicate signup of a VERIFIED email through the app
  const email = addr("s4-verified");
  await signup(browser(), email, "first-password-1");
  const before = account(email)!;
  await confirmByEmail(email);
  await pastThrottle();
  const r = await signup(browser(), email, "second-password-2");
  const after = account(email);
  record("S4", "Verified email signs up again through the app", after ? "OK" : "REPRODUCED", [
    `answered ${r.status} ${JSON.stringify(r.json)} (a new email gets {"ok":true}, so this reveals the email has an account)`,
    `account still exists: ${!!after}; verified: ${after?.confirmed}; password unchanged: ${after?.passwordFingerprint === before.passwordFingerprint}`,
    `profile intact: ${!!profile(before.id)}`]);
}

{ // S5: double-submit (two identical signups at the same moment)
  const email = addr("s5-double");
  const [a, b] = await Promise.all([signup(browser(), email, "double-password-1"), signup(browser(), email, "double-password-1")]);
  const acct = account(email);
  record("S5", "Double-submit: the same new signup sent twice at once", acct ? "NOT REPRODUCED" : "REPRODUCED", [
    `answers: ${a.status} ${JSON.stringify(a.json)} / ${b.status} ${JSON.stringify(b.json)}`,
    `account exists afterwards: ${!!acct}; profile exists: ${!!(acct && profile(acct.id))}`]);
}

{ // S6: legacy player code at signup, then verification and a password reset with the legacy trigger installed
  const [slug, code] = unclaimedCode();
  const email = addr("s6-player");
  const jar = browser();
  const r = await signup(jar, email, "player-password-1", code);
  const a = account(email)!;
  const claimedBeforeVerify = slot(slug);
  const confirmRedirect = await confirmByEmail(email);
  const afterVerify = account(email)!;
  const login = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: code, password: "player-password-1" });
  const forgot = await call(jar, forgotPOST, "/api/auth/forgot-password", { email });
  const recovery = await latestLink(email, "recovery");
  const recoveryRedirect = (await fetch(recovery, { redirect: "manual" })).headers.get("location") ?? "";
  const codeParam = new URL(recoveryRedirect).searchParams.get("code");
  const callback = await call(jar, (req) => callbackGET(req), `/auth/callback?code=${codeParam}`, undefined, "GET");
  const reset = await call(jar, resetPOST, "/api/auth/reset-password", { password: "player-password-2" });
  const afterReset = account(email)!;
  const loginNew = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: code, password: "player-password-2" });
  record("S6", `Player code (${code}, predictable) at signup, then verify, then password reset with the legacy trigger`, "INFO", [
    `signup answered ${r.status}; profile username "${profile(a.id)?.username}" linked to slot "${profile(a.id)?.playerSlug}"`,
    `slot claimed BEFORE the email was verified: ${claimedBeforeVerify.claimedBy === a.id} (no proof of identity beyond typing the code)`,
    `email confirmation: verified=${afterVerify.confirmed}; redirect ${confirmRedirect?.slice(0, 60)}`,
    `login with the code as username: ${login.status} ${JSON.stringify(login.json)}`,
    `forgot-password: ${forgot.status}; recovery link -> code present: ${!!codeParam}; callback -> ${callback.location}`,
    `reset-password: ${reset.status} ${JSON.stringify(reset.json)}; password changed: ${afterReset.passwordFingerprint !== afterVerify.passwordFingerprint}`,
    `legacy trigger effect: slot.password_created = ${slot(slug).passwordCreated}; login with the new password: ${loginNew.status}`]);
}

{ // S7: unverified login
  const email = addr("s7-unverified");
  await signup(browser(), email, "unverified-password-1");
  // V1 made a profile at signup; on V2 there is none until the email is verified, so log in by email instead.
  const username = profile(account(email)!.id)?.username ?? email;
  const wrong = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: username, password: "not-the-password" });
  const right = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: username, password: "unverified-password-1" });
  record("S7", "Login before verifying (by username)", "INFO", [
    `wrong password: ${wrong.status} ${JSON.stringify(wrong.json)}`,
    `right password: ${right.status} ${JSON.stringify(right.json)}`]);
}

{ // S8: accounts that end up with no profile
  const invited = addr("s8-invited");
  const invite = await admin.auth.admin.inviteUserByEmail(invited);
  const inviteLink = await latestLink(invited, "invite");
  const inviteRedirect = (await fetch(inviteLink, { redirect: "manual" })).headers.get("location") ?? "";
  const invitedAccount = account(invited);
  const direct = addr("s8-direct");
  await anon().auth.signUp({ email: direct, password: "direct-password-1" });
  await confirmByEmail(direct);
  const directLogin = await anon().auth.signInWithPassword({ email: direct, password: "direct-password-1" });
  const directAccount = account(direct)!;
  record("S8", "How a signed-in account can have no profile", "REPRODUCED", [
    `admin/dashboard-style invite (inviteUserByEmail): error=${invite.error?.message ?? "none"}; accepting the link redirects with a session: ${/access_token=/.test(inviteRedirect)}; verified: ${invitedAccount?.confirmed}; profile: ${!!(invitedAccount && profile(invitedAccount.id))}`,
    `signup straight to Supabase with the public anon key (skips the app): verified ${directAccount.confirmed}; signed in: ${!!directLogin.data.session}; profile: ${!!profile(directAccount.id)}`,
    `matches production accounts #01/#02: invited, verified a minute later, signed in, no profile`]);
}

{ // S9-S11: the admin invite route (old Maroon players) and what a later signup with that email does
  const hostEmail = addr("host");
  await signup(browser(), hostEmail, "host-password-1");
  await confirmByEmail(hostEmail);
  const host = browser();
  const hostLogin = await call(host, loginPOST, "/api/auth/login", { usernameOrEmail: hostEmail, password: "host-password-1" });
  // After signing in (V2 makes the profile at the first verified sign-in), mark it as the local test admin.
  sql(`update public.profiles set is_host = true where id = ${q(account(hostEmail)!.id)}`);
  const invite = async (slug: string, email: string) => {
    sql(`update public.player_slots set email = ${q(email)} where player_slug = ${q(slug)}`);
    return call(host, adminInvitePOST, "/api/portal/admin/invite", { playerSlug: slug });
  };

  // S9: a pending invite (like production accounts #04-#08), then someone signs up with that invited email.
  const [slug9, code9] = unclaimedCode();
  const invited = addr("s9-invited");
  const inv = await invite(slug9, invited);
  const before = account(invited)!;
  const claimBefore = slot(slug9);
  await pastThrottle();
  const dupe = await signup(browser(), invited, "someone-else-1");
  const after = account(invited);
  const claimAfter = slot(slug9);
  const stranger = addr("s9-other");
  const steal = await signup(browser(), stranger, "someone-else-2", code9);
  const strangerAccount = account(stranger);
  record("S9", `Pending admin invite holding player ${code9}, then a signup with the invited email`, !after ? "REPRODUCED" : "NOT REPRODUCED", [
    `host login ${hostLogin.status}; admin invite ${inv.status} ${JSON.stringify(inv.json)}; invited account verified: ${before.confirmed}; slot claimed by it: ${claimBefore.claimedBy === before.id}`,
    `signup with the invited email answered ${dupe.status} ${JSON.stringify(dupe.json)}`,
    `invited account still exists: ${!!after}; its profile: ${!!profile(before.id)}; slot still claimed by it: ${claimAfter.claimedBy === before.id} (claimed by anyone: ${!!claimAfter.claimedBy})`,
    `then a DIFFERENT new email signs up with code ${code9}: ${steal.status} ${JSON.stringify(steal.json)}; slot now claimed by that stranger: ${!!strangerAccount && slot(slug9).claimedBy === strangerAccount.id}`]);

  // S10: an admin invites an email that already has an unverified self-signup account.
  const [slug10] = unclaimedCode();
  const selfSigned = addr("s10-self");
  await signup(browser(), selfSigned, "self-password-1");
  const selfBefore = account(selfSigned)!;
  await pastThrottle();
  const inv10 = await invite(slug10, selfSigned);
  const selfAfter = account(selfSigned);
  record("S10", "Admin invites an email that already has an UNVERIFIED self-signup", selfAfter ? "NOT REPRODUCED" : "REPRODUCED", [
    `admin invite answered ${inv10.status} ${JSON.stringify(inv10.json)}`,
    `existing account still exists: ${!!selfAfter} (same id: ${selfAfter?.id === selfBefore.id}); its profile: ${!!profile(selfBefore.id)}; slot claimed: ${!!slot(slug10).claimedBy}`]);

  // S11: an admin invites an email that already has a VERIFIED account.
  const [slug11] = unclaimedCode();
  const verified = addr("s11-verified");
  await signup(browser(), verified, "verified-password-1");
  await confirmByEmail(verified);
  const vBefore = account(verified)!;
  await pastThrottle();
  const inv11 = await invite(slug11, verified);
  const vAfter = account(verified);
  record("S11", "Admin invites an email that already has a VERIFIED account", vAfter ? "OK" : "REPRODUCED", [
    `admin invite answered ${inv11.status} ${JSON.stringify(inv11.json)}`,
    `existing account still exists: ${!!vAfter} (same id: ${vAfter?.id === vBefore.id}); its profile: ${!!profile(vBefore.id)}; slot claimed: ${!!slot(slug11).claimedBy}`]);
}

console.log(`\nDone. ${requestCount()} network requests, all to 127.0.0.1. Accounts now in the isolated database: ${sql("select count(*) from auth.users")}.`);
console.log("JSON_RESULTS " + JSON.stringify(results));
