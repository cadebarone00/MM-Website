// Accounts V2 phase A2 — password security end to end on the ISOLATED local Supabase. Exits non-zero on any failure.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/password-regression.mts
// Real routes: signup, login, change password, forgot / reset, invite "set your password", delete (re-auth check).
import { createClient } from "@supabase/supabase-js";
import { addr, admin, anon, API, browser, call, confirmByEmail, latestLink, openLink, q, account, requestCount, sql, status, type Jar } from "./harness.mts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: changePOST } = await import("../../app/api/account/password/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { GET: whoGET, POST: passwordSessionPOST } = await import("../../app/api/auth/password-session/route.ts");
const { POST: deletePOST } = await import("../../app/api/account/delete/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const asToken = (token: string) => createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const signIn = (email: string, password: string) => anon().auth.signInWithPassword({ email, password });
const login = (jar: Jar, who: string, password: string) => call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: who, password });
const whoAmI = (jar: Jar) => call(jar, whoGET as never, "/api/auth/password-session", undefined, { method: "GET" });
const change = (jar: Jar, currentPassword: string, newPassword: string, headers?: Record<string, string>) =>
  call(jar, changePOST as never, "/api/account/password", { currentPassword, newPassword }, { headers });
/** A verified account with a finished profile, signed in on the web. */
async function person(name: string, password: string) {
  const email = addr(name), jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await login(jar, email, password);
  const id = account(email)!.id;
  sql(`update public.profiles set username = ${q(`${name.replace(/-/g, "_")}_${Date.now() % 100000}`)}, display_name = ${q(`Real ${name}`)} where id = ${q(id)}`);
  return { email, password, id, jar };
}
/** Can this access token still read the person's own profile through the REST API? */
async function restWorks(token: string, id: string) {
  const r = await asToken(token).from("profiles").select("id").eq("id", id);
  return !r.error && (r.data ?? []).length === 1;
}

section("Password rules everywhere a password is set (12+ characters, at most 72 bytes)");
{
  const short = await call(browser(), signupPOST, "/api/auth/signup", { email: addr("short"), password: "elevenchars" });
  check("signup: 11 characters refused by the app", short.status === 400, JSON.stringify(short.json));
  const direct = await anon().auth.signUp({ email: addr("short-direct"), password: "elevenchars" });
  check("signup straight to Supabase: 11 characters refused by Supabase too", !!direct.error, direct.error?.message);
  const phrase = await call(browser(), signupPOST, "/api/auth/signup", { email: addr("phrase"), password: "correct horse battery staple" });
  check("a passphrase with spaces is accepted", phrase.status === 200);
  const max = await call(browser(), signupPOST, "/api/auth/signup", { email: addr("max"), password: "ab".repeat(36) });
  check("exactly 72 bytes accepted", max.status === 200);
  const over = await call(browser(), signupPOST, "/api/auth/signup", { email: addr("over"), password: "ab".repeat(36) + "c" });
  check("73 bytes refused with a plain message", over.status === 400 && /too long/.test(String(over.json?.error)), JSON.stringify(over.json));
}

section("Existing (V1) accounts with short passwords can still sign in");
{
  const email = addr("v1-short");
  const created = await admin.auth.admin.createUser({ email, password: "placeholder-password-123", email_confirm: true });
  sql(`update auth.users set encrypted_password = extensions.crypt('short1', extensions.gen_salt('bf')) where id = ${q(created.data.user!.id)}`);
  sql(`insert into public.profiles (id, email, display_name, username) values (${q(created.data.user!.id)}, ${q(email)}, 'V1 Short', 'v1_short_pw')`);
  const r = await login(browser(), email, "short1");
  check("6-character V1 password still signs in (rules apply only when setting one)", r.status === 200, JSON.stringify(r.json));
}

section("Attacker with a stolen session but no current password");
const U = await person("owner", "original pass phrase 1");
const stolen = browser();
await login(stolen, U.email, U.password); // same account, another device / a stolen cookie
{
  const noCurrent = await change(stolen, "", "attacker chosen password");
  const guess = await change(stolen, "not the password", "attacker chosen password");
  check("change password without the current one: refused", noCurrent.status === 401 && guess.status === 401, `${noCurrent.status}/${guess.status}`);
  const resetPage = await call(stolen, resetPOST, "/api/auth/reset-password", { password: "attacker chosen password" });
  check("the reset page refuses an ordinary session (403)", resetPage.status === 403, JSON.stringify(resetPage.json));
  const viaSupabase = await (async () => {
    const c = createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = (await signIn(U.email, U.password)).data.session!;
    sql(`update auth.sessions set created_at = now() - interval '2 days' where id = ${q(JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString()).session_id)}`);
    await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    return c.auth.updateUser({ password: "attacker chosen password" });
  })();
  check("Supabase's own secure-password-change refuses an old session without re-auth", !!viaSupabase.error, viaSupabase.error?.message ?? "allowed");
  check("the password is unchanged", !(await signIn(U.email, U.password)).error && !!(await signIn(U.email, "attacker chosen password")).error);
  const deleteNoPassword = await call(stolen, deletePOST as never, "/api/account/delete", { confirm: "DELETE" });
  check("delete account with a stolen (even freshly signed-in) session but no password: refused", deleteNoPassword.status === 401 && deleteNoPassword.json?.reauth === true
    && sql(`select count(*) from public.account_deletions where account_id = ${q(U.id)}`) === "0", `${deleteNoPassword.status}`);
}

section("Change password (correct current password)");
{
  const other = (await signIn(U.email, U.password)).data.session!; // a third device
  const wrong = await change(U.jar, "nope nope nope", "new pass phrase 2026");
  check("wrong current password: 401, field marked", wrong.status === 401 && wrong.json?.field === "currentPassword");
  const weak = await change(U.jar, U.password, "too short");
  check("weak new password: 400 with the rule", weak.status === 400 && /12 characters/.test(String(weak.json?.error)), JSON.stringify(weak.json));
  const same = await change(U.jar, U.password, U.password);
  check("same as current: 400", same.status === 400 && /different/.test(String(same.json?.error)));
  check("other devices work before the change", await restWorks(other.access_token, U.id));
  const ok = await change(U.jar, U.password, "new pass phrase 2026");
  check("change succeeds", ok.status === 200 && ok.json?.ok === true, JSON.stringify(ok.json));
  check("old password no longer signs in; new one does", !!(await signIn(U.email, U.password)).error && !(await signIn(U.email, "new pass phrase 2026")).error);
  check("this browser stays signed in", (await whoAmI(U.jar)).status === 200);
  check("other device: refresh token revoked", !!(await anon().auth.refreshSession({ refresh_token: other.refresh_token })).error);
  check("other device: Auth refuses its access token", !!(await anon().auth.getUser(other.access_token)).error);
  check("other device: REST refuses its access token immediately (not after expiry)", !(await restWorks(other.access_token, U.id)));
  check("the stolen web session is signed out too", (await whoAmI(stolen)).status === 401);
  const retry = await change(U.jar, U.password, "new pass phrase 2026");
  check("an interrupted-then-retried request with the old password is refused (UI explains)", retry.status === 401);
  U.password = "new pass phrase 2026";
}

section("Native app (bearer token) change password");
{
  const s = (await signIn(U.email, U.password)).data.session!;
  const r = await change(browser(), U.password, "app pass phrase 2026", { authorization: `Bearer ${s.access_token}` });
  const fresh = (r.json?.session as { access_token?: string } | undefined)?.access_token;
  check("bearer change returns the new session for the app", r.status === 200 && !!fresh, JSON.stringify(r.json).slice(0, 80));
  check("the new session works; the old one doesn't", !!fresh && await restWorks(fresh, U.id) && !(await restWorks(s.access_token, U.id)));
  U.password = "app pass phrase 2026";
}

section("Forgot password: one-time link, no current password needed, everything else signed out");
{
  const device = (await signIn(U.email, U.password)).data.session!;
  const jar = browser();
  await call(jar, forgotPOST, "/api/auth/forgot-password", { email: U.email });
  const link = await latestLink(U.email, "recovery");
  const code = new URL((await fetch(link, { redirect: "manual" })).headers.get("location") ?? "").searchParams.get("code");
  const cb = await call(jar, callbackGET as never, `/auth/callback?code=${code}`, undefined, { method: "GET" });
  check("link opens the reset page", cb.location?.endsWith("/reset-password") === true, cb.location ?? "");
  const deleteWithLink = await call(jar, deletePOST as never, "/api/account/delete", { confirm: "DELETE" });
  check("a reset-link session can't confirm account deletion without the password", deleteWithLink.status === 401 && deleteWithLink.json?.reauth === true);
  const weak = await call(jar, resetPOST, "/api/auth/reset-password", { password: "short one" });
  check("weak new password refused on the reset page", weak.status === 400);
  const ok = await call(jar, resetPOST, "/api/auth/reset-password", { password: "recovered pass phrase 1" });
  check("reset succeeds", ok.status === 200, JSON.stringify(ok.json));
  check("every session signed out after a reset (the link's and other devices')", (await whoAmI(jar)).status === 401
    && !!(await anon().auth.refreshSession({ refresh_token: device.refresh_token })).error && !(await restWorks(device.access_token, U.id)));
  const reuse = (await fetch(link, { redirect: "manual" })).headers.get("location") ?? "";
  check("the same email link can't be used twice", /error/.test(reuse), reuse.slice(0, 80));
  check("new password signs in", (await login(browser(), U.email, "recovered pass phrase 1")).status === 200);
  U.password = "recovered pass phrase 1";
}

section("Invite email: setting the first password follows the same rules");
{
  const email = addr("invitee");
  await admin.auth.admin.inviteUserByEmail(email);
  const fragment = new URLSearchParams(new URL(await openLink(email, "invite")).hash.slice(1));
  const jar = browser();
  await call(jar, passwordSessionPOST, "/api/auth/password-session", { access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token") });
  const amr = JSON.parse(Buffer.from((fragment.get("access_token") ?? "..").split(".")[1], "base64url").toString()).amr;
  const weak = await call(jar, resetPOST, "/api/auth/reset-password", { password: "short" });
  const ok = await call(jar, resetPOST, "/api/auth/reset-password", { password: "invited pass phrase 1" });
  check("invite session: weak refused, strong accepted", weak.status === 400 && ok.status === 200, `${weak.status}/${ok.status} amr=${JSON.stringify(amr)}`);
  check("invitee signs in with it", (await login(browser(), email, "invited pass phrase 1")).status === 200);
}

console.log(`\n${passed} passed, ${failed} failed. ${requestCount()} network requests, all to 127.0.0.1.`);
process.exit(failed ? 1 : 0);
