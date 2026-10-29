// Sign in with Google / Apple, Step 1 (website) end to end on the ISOLATED local Supabase. Exits non-zero on any failure.
//   node scripts/auth-local/setup.mjs   (only if the isolated stack isn't running yet)
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/oauth-regression.mts
// Real Google / Apple can't run here (no credentials, no internet), and the stack has both providers OFF, so:
// - the start route is checked for its guards and the "not turned on" answer;
// - the callback's success path is driven by a real PKCE code from Supabase (a magic link started from the same
//   browser jar). /auth/callback?flow=oauth exchanges it exactly as it would a Google / Apple code, so profile
//   creation, repeat sign-ins and onboarding routing are tested against the real database. (The code comes from a
//   password-reset link: the local magic-link email is a typed code, not a link.)
import { addr, admin, browser, call, latestLink, q, sql, type Jar } from "./harness.mts";

const { POST: oauthPOST } = await import("../../app/api/auth/oauth/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { createSupabaseServerClient } = await import("../../lib/supabase/server.ts");
const { getCurrentProfile } = await import("../../lib/profile/currentProfile.ts");
const { enabledOAuthProviders } = await import("../../lib/auth/oauthServer.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const SITE = "http://127.0.0.1:3999";
const INVITE = "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345";

/** Runs `fn` as the browser that owns `jar` (same cookie-jar mechanism as harness.call). */
const as = <T,>(jar: Jar, fn: () => Promise<T>) => { (globalThis as { __authLocalJar?: Jar }).__authLocalJar = jar; return fn(); };
const hasSession = (jar: Jar) => [...jar.keys()].some((name) => /-auth-token(\.\d+)?$/.test(name));
const profileCount = (id: string) => Number(sql(`select count(*) from public.profiles where id = ${q(id)}`));
const where = (location: string | null) => location ? new URL(location).pathname + new URL(location).search : "";

/** The form the Continue with Google / Apple button posts. */
function startForm(fields: Record<string, string>, origin = SITE) {
  const body = new URLSearchParams(fields);
  return new Request(`${SITE}/api/auth/oauth`, { method: "POST", headers: { origin, "Content-Type": "application/x-www-form-urlencoded" }, body });
}

/** A real one-time PKCE code for `email`, started from `jar` (so the jar holds the PKCE secret, like a real browser).
 *  Opens the newest reset email, so call pastThrottle() between two codes for one address. */
async function pkceCode(jar: Jar, email: string, returnTo?: string, onboarding = false) {
  const back = new URL("/auth/callback", SITE);
  back.searchParams.set("flow", "oauth");
  if (returnTo) back.searchParams.set("returnTo", returnTo);
  if (onboarding) back.searchParams.set("onboarding", "1");
  const { error } = await as(jar, async () => (await createSupabaseServerClient()).auth.resetPasswordForEmail(email, { redirectTo: back.toString() }));
  if (error) throw new Error(`reset link: ${error.message}`);
  const link = await latestLink(email, "recovery");
  const location = (await fetch(link, { redirect: "manual" })).headers.get("location") ?? "";
  const url = new URL(location);
  if (!url.searchParams.get("code")) throw new Error(`no code in ${location}`);
  return url.pathname + url.search;
}
const pastThrottle = () => new Promise((r) => setTimeout(r, 1600));
/** A verified account with no profile yet: what Supabase makes the first time someone uses Google / Apple. */
async function verifiedAccount(email: string, userMetadata: Record<string, unknown> = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: userMetadata });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

section("Buttons only for providers that are turned on");
check("local stack has Google + Apple off, so no buttons", (await enabledOAuthProviders()).length === 0);

section("Start route guards");
{
  const jar = browser();
  const cross = await as(jar, () => oauthPOST(startForm({ provider: "google" }, "https://evil.example")));
  check("another site can't start a sign-in", cross.status === 403);
  const noOrigin = await as(jar, () => oauthPOST(new Request(`${SITE}/api/auth/oauth`, { method: "POST", body: new URLSearchParams({ provider: "google" }) })));
  check("a request with no Origin is refused", noOrigin.status === 403);
  const bad = await as(jar, () => oauthPOST(startForm({ provider: "github" })));
  check("unknown provider goes back to login with an error", bad.status === 303 && where(bad.headers.get("location")) === "/login?error=failed", where(bad.headers.get("location")));
  const off = await as(jar, () => oauthPOST(startForm({ provider: "google", next: INVITE })));
  check("provider not turned on: friendly 'not available' and the invite is kept", off.status === 303
    && where(off.headers.get("location")) === `/login?error=unavailable&next=${encodeURIComponent(INVITE)}`, where(off.headers.get("location")));
  const offApple = await as(jar, () => oauthPOST(startForm({ provider: "apple", next: "https://evil.example" })));
  check("Apple off too; an outside return page is dropped", where(offApple.headers.get("location")) === "/login?error=unavailable");
  check("nothing started: no session and no PKCE secret stored", jar.size === 0, [...jar.keys()].join(","));
}

section("Callback: cancel, denied and bad codes leave no session");
{
  const jar = browser();
  const cancel = await call(jar, callbackGET, `/auth/callback?flow=oauth&returnTo=${encodeURIComponent(INVITE)}&error=access_denied&error_description=denied`, undefined, { method: "GET" });
  check("cancel → login says cancelled, invite kept", where(cancel.location) === `/login?error=cancelled&next=${encodeURIComponent(INVITE)}`, where(cancel.location));
  const apple = await call(jar, callbackGET, "/auth/callback?flow=oauth&error=user_cancelled_authorize", undefined, { method: "GET" });
  check("Apple cancel → cancelled", where(apple.location) === "/login?error=cancelled", where(apple.location));
  const server = await call(jar, callbackGET, "/auth/callback?flow=oauth&error=server_error&error_description=Unable+to+exchange+external+code", undefined, { method: "GET" });
  check("token failure from the provider → failed", where(server.location) === "/login?error=failed", where(server.location));
  const missing = await call(jar, callbackGET, "/auth/callback?flow=oauth", undefined, { method: "GET" });
  check("no code → failed", where(missing.location) === "/login?error=failed", where(missing.location));
  const bogus = await call(jar, callbackGET, "/auth/callback?flow=oauth&code=00000000-0000-0000-0000-000000000000", undefined, { method: "GET" });
  check("made-up code → failed", where(bogus.location) === "/login?error=failed", where(bogus.location));
  check("no session after any of these", !hasSession(jar), [...jar.keys()].join(","));
}

section("Code from another browser is refused (PKCE)");
{
  const email = addr("oauth-pkce");
  await verifiedAccount(email);
  const owner = browser();
  const path = await pkceCode(owner, email);
  const thief = browser();
  const stolen = await call(thief, callbackGET, path, undefined, { method: "GET" });
  check("a code without this browser's PKCE secret fails", where(stolen.location) === "/login?error=failed" && !hasSession(thief), where(stolen.location));
}

section("New account → onboarding (profile setup), one profile");
const email = addr("oauth-new");
const id = await verifiedAccount(email);
{
  check("before: verified account, no profile", profileCount(id) === 0);
  const jar = browser();
  const done = await call(jar, callbackGET, await pkceCode(jar, email), undefined, { method: "GET" });
  check("lands on /profile", where(done.location) === "/profile", where(done.location));
  check("signed in", hasSession(jar));
  check("exactly one profile, id = account id", profileCount(id) === 1);
  const current = await as(jar, () => getCurrentProfile());
  check("profile is unfinished, so /profile shows setup (onboarding)", current.status === "incomplete", current.status);
}

section("Repeat sign-in (same account) never makes a second profile");
{
  await pastThrottle();
  const jar = browser();
  const again = await call(jar, callbackGET, await pkceCode(jar, email, INVITE), undefined, { method: "GET" });
  check("returns to the invite page it started from", where(again.location) === INVITE, where(again.location));
  check("still exactly one profile", profileCount(id) === 1);
}

section("Finished profile → normal app, no onboarding again");
{
  const username = `oauth${Date.now().toString(36)}`.slice(0, 20);
  sql(`update public.profiles set username = ${q(username)}, display_name = 'OAuth Tester' where id = ${q(id)}`);
  await pastThrottle();
  const jar = browser();
  const back = await call(jar, callbackGET, await pkceCode(jar, email), undefined, { method: "GET" });
  check("lands on /profile", where(back.location) === "/profile", where(back.location));
  const current = await as(jar, () => getCurrentProfile());
  check("profile is finished (normal profile, not setup)", current.status === "ok", current.status);
  check("same profile id kept", current.status === "ok" && current.profile.profileId === id);
  check("name and username untouched", sql(`select username || '|' || display_name from public.profiles where id = ${q(id)}`) === `${username}|OAuth Tester`);
  check("still exactly one profile", profileCount(id) === 1);
}

section("Return page can't be pointed at another site");
{
  await pastThrottle();
  const jar = browser();
  const path = await pkceCode(jar, email);
  const evil = await call(jar, callbackGET, `${path}&returnTo=${encodeURIComponent("https://evil.example")}`, undefined, { method: "GET" });
  check("outside return page ignored → /profile", where(evil.location) === "/profile", where(evil.location));
}

section("Email links still use the old path");
{
  const jar = browser();
  const old = await call(jar, callbackGET, "/auth/callback?error=access_denied", undefined, { method: "GET" });
  check("non-OAuth callback error still goes to the password form", where(old.location) === "/reset-password?error=invalid_link", where(old.location));
}

section("Phase 7C: onboarding screens on (MAROON_V2_ONBOARDING=on)");
process.env.MAROON_V2_ONBOARDING = "on";
try {
  const jar = browser();
  const off = await as(jar, () => oauthPOST(startForm({ provider: "google", onboarding: "1" })));
  check("provider not configured, started on /start -> /start/log-in says unavailable", where(off.headers.get("location")) === "/start/log-in?error=unavailable", where(off.headers.get("location")));
  const cancel = await call(jar, callbackGET, "/auth/callback?flow=oauth&onboarding=1&error=access_denied", undefined, { method: "GET" });
  check("cancel from /start -> /start/log-in?error=cancelled, no session", where(cancel.location) === "/start/log-in?error=cancelled" && !hasSession(jar), where(cancel.location));
  const failedCode = await call(jar, callbackGET, "/auth/callback?flow=oauth&onboarding=1&code=made-up", undefined, { method: "GET" });
  check("failed exchange from /start -> /start/log-in?error=failed", where(failedCode.location) === "/start/log-in?error=failed", where(failedCode.location));
  const oldScreen = await call(jar, callbackGET, "/auth/callback?flow=oauth&error=access_denied", undefined, { method: "GET" });
  check("a sign-in started on the old /login still returns there", where(oldScreen.location) === "/login?error=cancelled", where(oldScreen.location));

  const gEmail = addr("oauth7c-google");
  const gId = await verifiedAccount(gEmail, { full_name: "Gale Googler", given_name: "Gale", family_name: "Googler" });
  const gJar = browser();
  const g = await call(gJar, callbackGET, await pkceCode(gJar, gEmail, undefined, true), undefined, { method: "GET" });
  check("new Google-style account -> /onboarding (routes by lifecycle), signed in", where(g.location) === "/onboarding" && hasSession(gJar), where(g.location));
  check("exactly one profile, id = account id", profileCount(gId) === 1);
  check("the provider's name is NOT written into the profile (only suggested on the Name screen)", sql(`select coalesce(display_name, '<none>') from public.profiles where id = ${q(gId)}`) === "<none>");
  await pastThrottle();
  const again = await call(gJar, callbackGET, await pkceCode(gJar, gEmail, undefined, true), undefined, { method: "GET" });
  check("signing in again -> still /onboarding, still one profile", where(again.location) === "/onboarding" && profileCount(gId) === 1);
  await pastThrottle();
  const invite = await call(gJar, callbackGET, await pkceCode(gJar, gEmail, INVITE, true), undefined, { method: "GET" });
  check("an allowed return page (invite) is still honoured", where(invite.location) === INVITE, where(invite.location));

  const relay = `oauth7c-${Date.now().toString(36)}@privaterelay.appleid.com`;
  const aId = await verifiedAccount(relay, { full_name: "Apple Person" });
  const aJar = browser();
  const a = await call(aJar, callbackGET, await pkceCode(aJar, relay, undefined, true), undefined, { method: "GET" });
  check("Apple Hide My Email address -> its own account + profile, routed to /onboarding", where(a.location) === "/onboarding" && profileCount(aId) === 1
    && sql(`select email from public.profiles where id = ${q(aId)}`) === relay, where(a.location));

  const twinEmail = addr("oauth7c-twin");
  const twinId = await verifiedAccount(twinEmail, { full_name: "Gale Googler", given_name: "Gale", family_name: "Googler" });
  const tJar = browser();
  await call(tJar, callbackGET, await pkceCode(tJar, twinEmail, undefined, true), undefined, { method: "GET" });
  check("same name, different account: never merged (two accounts, two profiles)", twinId !== gId && profileCount(twinId) === 1 && profileCount(gId) === 1);

  const finished = sql(`select username || '|' || display_name from public.profiles where id = ${q(id)}`);
  const fJar = browser();
  await pastThrottle();
  const f = await call(fJar, callbackGET, await pkceCode(fJar, email, undefined, true), undefined, { method: "GET" });
  check("an existing finished profile -> /onboarding (server decides), name untouched", where(f.location) === "/onboarding"
    && sql(`select username || '|' || display_name from public.profiles where id = ${q(id)}`) === finished, where(f.location));
} finally {
  delete process.env.MAROON_V2_ONBOARDING;
}
{
  const jar = browser();
  const off = await as(jar, () => oauthPOST(startForm({ provider: "google", onboarding: "1" })));
  check("flag off: onboarding=1 is ignored (old /login)", where(off.headers.get("location")) === "/login?error=unavailable", where(off.headers.get("location")));
  const cancel = await call(jar, callbackGET, "/auth/callback?flow=oauth&onboarding=1&error=access_denied", undefined, { method: "GET" });
  check("flag off: cancel still goes to /login", where(cancel.location) === "/login?error=cancelled", where(cancel.location));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
