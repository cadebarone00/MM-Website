// Accounts V2 phase A4 — sessions and devices end to end on the ISOLATED local Supabase. Exits non-zero on any failure.
//   node scripts/auth-local/setup.mjs
//   npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/session-regression.mts
// Several "devices" on one account: web browsers (cookie jars through the real routes) and app sessions (bearer
// tokens). Every revocation is checked against the OLD ACCESS TOKEN (REST + Storage), not only the refresh token.
import { createClient } from "@supabase/supabase-js";
import { addr, admin, anon, API, browser, call, confirmByEmail, latestLink, q, account, requestCount, sql, status, type Jar } from "./harness.mts";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: signoutPOST } = await import("../../app/api/auth/signout/route.ts");
const { POST: sessionsPOST } = await import("../../app/api/account/sessions/route.ts");
const { POST: changePOST } = await import("../../app/api/account/password/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { GET: whoGET } = await import("../../app/api/auth/password-session/route.ts");
const { POST: deletePOST } = await import("../../app/api/account/delete/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const asToken = (token: string) => createClient(API, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const BUCKET = "session-probe";
await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
sql(`drop policy if exists session_probe_all on storage.objects;
     create policy session_probe_all on storage.objects for all to authenticated using (bucket_id = '${BUCKET}' and owner_id = auth.uid()::text) with check (bucket_id = '${BUCKET}');`);

let U = { email: "", password: "session pass phrase 1", id: "" };
const jarToken = (jar: Jar) => {
  const raw = [...jar.entries()].filter(([k]) => k.includes("auth-token")).sort().map(([, v]) => v).join("");
  try { return JSON.parse(raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : raw).access_token as string; } catch { return ""; }
};
/** A web browser signed in through the real login route. */
async function web() { const jar = browser(); await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: U.email, password: U.password }); return jar; }
/** An app session (what the iOS app would hold). */
async function app() { return (await anon().auth.signInWithPassword({ email: U.email, password: U.password })).data.session!; }
const signedIn = async (jar: Jar) => (await call(jar, whoGET as never, "/api/auth/password-session", undefined, { method: "GET" })).status === 200;
/** Does an access token still reach data: REST (own profile) AND Storage (own file)? */
async function tokenWorks(token: string) {
  const rest = await asToken(token).from("profiles").select("id").eq("id", U.id);
  const file = await asToken(token).storage.from(BUCKET).download(`${U.id}/note.txt`);
  return { rest: !rest.error && (rest.data ?? []).length === 1, storage: !file.error };
}
const dead = async (token: string) => { const t = await tokenWorks(token); return !t.rest && !t.storage; };
const alive = async (token: string) => { const t = await tokenWorks(token); return t.rest && t.storage; };
const sessionCount = () => Number(sql(`select count(*) from auth.sessions where user_id = ${q(U.id)}`));

section("Setup: one account, a profile, a private file");
{
  const email = addr("devices"), jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password: U.password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password: U.password });
  U = { email, password: U.password, id: account(email)!.id };
  sql(`update public.profiles set username = 'devices_${Date.now() % 100000}', display_name = 'Device Owner' where id = ${q(U.id)}`);
  const s = await app();
  const up = await asToken(s.access_token).storage.from(BUCKET).upload(`${U.id}/note.txt`, new Blob(["mine"]), { upsert: true });
  check("setup ok", !up.error && await alive(s.access_token), up.error?.message);
}

section("Normal Sign Out = this device only (web and app)");
{
  const webA = await web(), webB = await web(), appC = await app(), appD = await app();
  const tokenA = jarToken(webA);
  check("web A's token works before", !!tokenA && await alive(tokenA));
  const out = await call(webA, signoutPOST, "/api/auth/signout", {});
  check("web A signs out", out.status === 200 && !(await signedIn(webA)));
  check("web A's OLD access token is refused at once (REST + Storage)", await dead(tokenA));
  check("web B still signed in", await signedIn(webB));
  check("app C still works", await alive(appC.access_token));
  const outC = await call(browser(), signoutPOST, "/api/auth/signout", {}, { headers: { authorization: `Bearer ${appC.access_token}` } });
  check("app C signs out with its bearer token", outC.status === 200 && await dead(appC.access_token) && !!(await anon().auth.refreshSession({ refresh_token: appC.refresh_token })).error);
  check("app D unaffected", await alive(appD.access_token));
  const twice = await call(webA, signoutPOST, "/api/auth/signout", {});
  check("signing out twice is harmless", twice.status === 200);
}

section("Sign out of other devices: needs the password; this device stays signed in");
{
  const mine = await web(), thief = await web(), appX = await app();
  const noPw = await call(thief, sessionsPOST as never, "/api/account/sessions", { scope: "others" });
  const wrong = await call(thief, sessionsPOST as never, "/api/account/sessions", { scope: "global", password: "guess guess guess" });
  check("a session without the password can't sign anyone out", noPw.status === 401 && wrong.status === 401 && await signedIn(mine) && await alive(appX.access_token));
  const bad = await call(mine, sessionsPOST as never, "/api/account/sessions", { scope: "everyone", password: U.password });
  check("unknown scope refused", bad.status === 400);
  const before = jarToken(mine);
  const r = await call(mine, sessionsPOST as never, "/api/account/sessions", { scope: "others", password: U.password, accountId: "someone-else" });
  check("sign out of other devices succeeds", r.status === 200 && r.json?.scope === "others", JSON.stringify(r.json));
  check("this browser stays signed in (on a fresh session)", await signedIn(mine) && jarToken(mine) !== before && await alive(jarToken(mine)));
  check("the thief's web session is signed out", !(await signedIn(thief)));
  check("the app's OLD access token is refused at once", await dead(appX.access_token));
  check("only this device's session remains", sessionCount() === 1, String(sessionCount()));
}

section("Sign out of other devices from the app (bearer): the app gets its new tokens");
{
  const appY = await app(), webZ = await web();
  const r = await call(browser(), sessionsPOST as never, "/api/account/sessions", { scope: "others", password: U.password }, { headers: { authorization: `Bearer ${appY.access_token}` } });
  const fresh = (r.json?.session as { access_token?: string } | undefined)?.access_token ?? "";
  check("bearer: new session returned and working", r.status === 200 && await alive(fresh));
  check("bearer: the app's old token and the web session are revoked", await dead(appY.access_token) && !(await signedIn(webZ)));
}

section("Sign out everywhere (security option)");
{
  const webE = await web(), appF = await app();
  const r = await call(webE, sessionsPOST as never, "/api/account/sessions", { scope: "global", password: U.password });
  check("everywhere succeeds and signs this browser out too", r.status === 200 && r.json?.signedOut === true && !(await signedIn(webE)));
  check("no sessions left; old tokens refused", sessionCount() === 0 && await dead(appF.access_token));
  check("the account still works: sign in again", (await anon().auth.signInWithPassword({ email: U.email, password: U.password })).data.session !== null);
}

section("Concurrent sign-outs");
{
  const a = await web(), b = await web(), c = await app();
  const ta = jarToken(a), tb = jarToken(b);
  const [ra, rb] = await Promise.all([call(a, signoutPOST, "/api/auth/signout", {}), call(b, signoutPOST, "/api/auth/signout", {})]);
  check("two devices signing out at once: both end, others untouched", ra.status === 200 && rb.status === 200 && await dead(ta) && await dead(tb) && await alive(c.access_token));
  const d = await web();
  const [x, y] = await Promise.all([
    call(d, sessionsPOST as never, "/api/account/sessions", { scope: "others", password: U.password }),
    call(await web(), sessionsPOST as never, "/api/account/sessions", { scope: "others", password: U.password }),
  ]);
  check("two 'sign out others' at once: both answer cleanly, app session revoked", [x.status, y.status].every((s) => s === 200) && await dead(c.access_token), `${x.status}/${y.status}`);
}

section("Expired (time-boxed) sessions");
{
  const s = await app();
  check("works before", await alive(s.access_token));
  const sid = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString()).session_id;
  sql(`update auth.sessions set not_after = now() - interval '1 minute' where id = ${q(sid)}`);
  check("past its end time: old access token refused at once", await dead(s.access_token));
  check("and its refresh token refused", !!(await anon().auth.refreshSession({ refresh_token: s.refresh_token })).error);
}

section("Password change and reset still sign out the right devices (A2 behavior kept)");
{
  const keep = await web(), other = await app();
  const r = await call(keep, changePOST as never, "/api/account/password", { currentPassword: U.password, newPassword: "session pass phrase 2" });
  check("password change: this browser stays, other device's old token refused", r.status === 200 && await signedIn(keep) && await dead(other.access_token));
  U.password = "session pass phrase 2";
  const device = await app(), jar = browser();
  await call(jar, forgotPOST, "/api/auth/forgot-password", { email: U.email });
  const code = new URL((await fetch(await latestLink(U.email, "recovery"), { redirect: "manual" })).headers.get("location") ?? "").searchParams.get("code");
  await call(jar, callbackGET as never, `/auth/callback?code=${code}`, undefined, { method: "GET" });
  const reset = await call(jar, resetPOST, "/api/auth/reset-password", { password: "session pass phrase 3" });
  check("reset still signs out EVERYWHERE (global, unchanged)", reset.status === 200 && !(await signedIn(keep)) && await dead(device.access_token) && sessionCount() === 0);
  U.password = "session pass phrase 3";
}

section("Deleted account: sign-out paths stay harmless; tokens dead");
{
  const jar = await web(), other = await app();
  const del = await call(jar, deletePOST as never, "/api/account/delete", { confirm: "DELETE", password: U.password });
  check("account deleted (global sign-out by deletion, unchanged)", del.status === 200 && del.json?.state === "completed", JSON.stringify(del.json));
  const out = await call(jar, signoutPOST, "/api/auth/signout", {});
  const outBearer = await call(browser(), signoutPOST, "/api/auth/signout", {}, { headers: { authorization: `Bearer ${other.access_token}` } });
  check("sign out afterwards: harmless", out.status === 200 && outBearer.status === 200);
  check("old tokens dead", await dead(other.access_token));
  const others = await call(browser(), sessionsPOST as never, "/api/account/sessions", { scope: "others", password: U.password }, { headers: { authorization: `Bearer ${other.access_token}` } });
  check("device management refuses a deleted account", others.status === 401);
}

console.log(`\n${passed} passed, ${failed} failed. ${requestCount()} network requests, all to 127.0.0.1.`);
process.exit(failed ? 1 : 0);
