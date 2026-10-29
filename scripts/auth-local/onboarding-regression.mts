// Pending accounts Phase 6: code-based email verification and code-based password recovery through the REAL route
// handlers against the ISOLATED local Supabase (its email templates carry the 6-digit code: scripts/auth-local/templates).
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/onboarding-regression.mts
// Installs supabase/account_activation.sql + supabase/auth_code_attempts.sql on the isolated stack only.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { account, addr, anon, browser, call, latestLink, MAIL, pastThrottle, sql, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: resendPOST } = await import("../../app/api/auth/resend-verification/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { POST: verifyPOST } = await import("../../app/api/auth/verify-code/route.ts");
const { GET: callbackGET } = await import("../../app/auth/callback/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const psql = (file: string) => execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync(file) });
psql("supabase/account_activation.sql");
psql("supabase/auth_code_attempts.sql");
sql("notify pgrst, 'reload schema'");
await new Promise((r) => setTimeout(r, 1500));

const PASSWORD = "onboarding-pass-1";
const hasSession = (jar: Jar) => [...jar.keys()].some((k) => k.includes("auth-token") && !k.includes("code-verifier"));
const verify = (jar: Jar, body: unknown) => call(jar, verifyPOST, "/api/auth/verify-code", body);
const resume = (jar: Jar, token?: string) => call(jar, onboardingGET as never, "/api/account/onboarding", undefined,
  { method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {} });

type MailSummary = { ID: string; Subject: string; Created: string };
/** The 6-digit code in the newest email to `email` whose subject contains `subject`. `after` = ignore older ones. */
async function latestCode(email: string, subject: string, after = 0): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json() as { messages: MailSummary[] };
    const newest = (list.messages ?? []).filter((m) => m.Subject.includes(subject) && Date.parse(m.Created) > after)
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${newest.ID}`)).json() as { Text?: string; HTML?: string };
      const code = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(/code in The Maroon:\s*(?:<strong>)?(\d{6})/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no "${subject}" code email for ${email}`);
}
const SIGNUP_MAIL = "Confirm your email", RESET_MAIL = "Reset your Maroon password";
/** Signs up through the real route (as the Create password screen does) and returns the emailed code. */
async function signUp(name: string) {
  const email = addr(name), jar = browser(), sent = Date.now() - 1000;
  const r = await call(jar, signupPOST, "/api/auth/signup", { email, password: PASSWORD, next: "/onboarding" });
  return { email, jar, status: r.status, code: await latestCode(email, SIGNUP_MAIL, sent) };
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

section("Switched off by default");
delete process.env.MAROON_V2_ONBOARDING;
check("MAROON_V2_ONBOARDING unset -> verify-code is 404", (await verify(browser(), { email: addr("off"), code: "123456", type: "signup" })).status === 404);
process.env.MAROON_V2_ONBOARDING = "yes";
check("anything but exactly \"on\" -> 404", (await verify(browser(), { email: addr("off"), code: "123456", type: "signup" })).status === 404);
process.env.MAROON_V2_ONBOARDING = "on";

section("Sign-up verification by code");
const ann = await signUp("ann");
check("sign-up ok and the email carries a 6-digit code", ann.status === 200 && /^\d{6}$/.test(ann.code));
let r = await verify(ann.jar, { email: ann.email, code: wrong(ann.code), type: "signup" });
check("wrong code -> 400 invalid_code", r.status === 400 && r.json?.code === "invalid_code", JSON.stringify(r.json));
const wrongBody = JSON.stringify(r.json);
check("wrong code: not verified, no session", !account(ann.email)!.confirmed && !hasSession(ann.jar));
r = await verify(browser(), { email: addr("nobody-here"), code: ann.code, type: "signup" });
check("address with no account -> the very same answer", r.status === 400 && JSON.stringify(r.json) === wrongBody);
for (const body of [{ email: ann.email, code: "12345", type: "signup" }, { email: ann.email, code: "abcdef", type: "signup" }, { email: ann.email, code: ann.code, type: "magiclink" }, { code: ann.code, type: "signup" }]) {
  r = await verify(browser(), body);
  check(`bad input ${JSON.stringify(body).slice(0, 60)} -> 400 invalid_input`, r.status === 400 && r.json?.code === "invalid_input");
}
r = await verify(ann.jar, { email: ann.email.toUpperCase(), code: ann.code, type: "signup" });
check("right code (address in any case) -> 200 next confirmed", r.status === 200 && r.json?.ok === true && r.json?.next === "confirmed", JSON.stringify(r.json));
check("verified, and this browser is signed in", account(ann.email)!.confirmed && hasSession(ann.jar));
check("no tokens in the website reply", !("session" in (r.json ?? {})));
check("the profile row exists (initialized like log-in)", sql(`select count(*) from public.profiles where id = '${account(ann.email)!.id}'`) === "1");
check("attempt counter cleared after success", sql(`select count(*) from public.auth_code_attempts where key_hash = encode(sha256(convert_to('${ann.email}', 'UTF8')), 'hex')`) === "0");
r = await resume(ann.jar);
check("resume -> name_username (Pending, details missing)", r.json?.state === "pending" && r.json?.next === "name_username", JSON.stringify(r.json));
r = await verify(browser(), { email: ann.email, code: ann.code, type: "signup" });
check("the same code again -> invalid_code (single use)", r.status === 400 && r.json?.code === "invalid_code");

section("Expired and resent codes");
const ben = await signUp("ben");
sql(`update auth.users set confirmation_sent_at = now() - interval '2 hours' where email = '${ben.email}'`);
r = await verify(ben.jar, { email: ben.email, code: ben.code, type: "signup" });
check("expired code -> the same invalid_code answer", r.status === 400 && JSON.stringify(r.json) === wrongBody);
await pastThrottle();
const resentAt = Date.now() - 1000;
r = await call(ben.jar, resendPOST, "/api/auth/resend-verification", { email: ben.email, next: "/onboarding" });
const benNew = await latestCode(ben.email, SIGNUP_MAIL, resentAt);
check("resend -> ok and a new code", r.status === 200 && /^\d{6}$/.test(benNew));
if (benNew !== ben.code) {
  r = await verify(browser(), { email: ben.email, code: ben.code, type: "signup" });
  check("the old code no longer works after a resend", r.status === 400 && r.json?.code === "invalid_code");
} else check("resend produced a different code", false, "same code twice");
r = await verify(ben.jar, { email: ben.email, code: benNew, type: "signup" });
check("the new code works", r.status === 200 && account(ben.email)!.confirmed);
r = await call(browser(), resendPOST, "/api/auth/resend-verification", { email: addr("nobody-resend"), next: "/onboarding" });
check("resend for an unknown address -> the same ok", r.status === 200 && r.json?.ok === true);

section("Attempt limit (5 per address per 15 minutes)");
const cal = await signUp("cal");
const statuses: number[] = [];
for (let i = 0; i < 5; i++) statuses.push((await verify(browser(), { email: cal.email, code: wrong(cal.code), type: "signup" })).status);
check("5 wrong codes -> 400 each", statuses.every((s) => s === 400), statuses.join(","));
r = await verify(cal.jar, { email: cal.email, code: cal.code, type: "signup" });
check("6th try, even the RIGHT code -> 429 too_many_attempts", r.status === 429 && r.json?.code === "too_many_attempts", JSON.stringify(r.json));
check("still not verified, no session", !account(cal.email)!.confirmed && !hasSession(cal.jar));
check("the limit only stores hashes, never addresses", sql("select count(*) from public.auth_code_attempts where key_hash like '%@%'") === "0");
r = await verify(browser(), { email: addr("cal-other"), code: "000000", type: "signup" });
check("another address is not affected", r.status === 400);
r = await verify(browser(), { email: cal.email, code: "000000", type: "recovery" });
check("the reset-code limit is counted separately", r.status === 400);
sql("update public.auth_code_attempts set attempted_at = attempted_at - interval '16 minutes'");
r = await verify(cal.jar, { email: cal.email, code: cal.code, type: "signup" });
check("15 minutes later the right code works", r.status === 200 && account(cal.email)!.confirmed);
check("browsers can't read or write the attempts table", sql("select has_table_privilege('anon', 'public.auth_code_attempts', 'select') or has_table_privilege('authenticated', 'public.auth_code_attempts', 'insert')") === "f");

section("Phone app (no cookies; the session comes back in the reply)");
const dee = await signUp("dee");
const appJar = browser();
r = await verify(appJar, { email: dee.email, code: dee.code, type: "signup", client: "app" });
const session = r.json?.session as { access_token?: string; refresh_token?: string } | undefined;
check("app verify -> 200 with access + refresh token", r.status === 200 && !!session?.access_token && !!session?.refresh_token);
check("app verify sets no cookies", appJar.size === 0);
r = await resume(browser(), session?.access_token);
check("the returned token works as a Bearer session (resume -> name_username)", r.json?.next === "name_username", JSON.stringify(r.json));

section("Password reset by code");
const eve = await signUp("eve");
await verify(eve.jar, { email: eve.email, code: eve.code, type: "signup" });
const otherDevice = (await anon().auth.signInWithPassword({ email: eve.email, password: PASSWORD })).data.session!;
const before = account(eve.email)!.passwordFingerprint;
let sentAt = Date.now() - 1000;
await pastThrottle();
r = await call(browser(), forgotPOST, "/api/auth/forgot-password", { email: eve.email, next: "/start" });
const resetCode = await latestCode(eve.email, RESET_MAIL, sentAt);
check("forgot-password -> ok and the email carries a code", r.status === 200 && /^\d{6}$/.test(resetCode));
r = await call(browser(), forgotPOST, "/api/auth/forgot-password", { email: addr("nobody-forgot"), next: "/start" });
check("forgot-password for an unknown address -> the same ok", r.status === 200 && r.json?.ok === true);
const resetJar = browser();
r = await verify(resetJar, { email: eve.email, code: wrong(resetCode), type: "recovery" });
check("wrong reset code -> invalid_code, no session", r.status === 400 && r.json?.code === "invalid_code" && !hasSession(resetJar));
r = await call(resetJar, resetPOST, "/api/auth/reset-password", { password: "brand-new-password-1" });
check("no password change without the code", r.status === 401 && account(eve.email)!.passwordFingerprint === before);
r = await verify(browser(), { email: eve.email, code: resetCode, type: "signup" });
check("a reset code is not a sign-up code", r.status === 400);
// A password log-in (not a code or link) is an ordinary session. (A session from the SIGN-UP code within the hour is
// accepted by the existing reset route, like the sign-up link always was: both prove the person reads that inbox.)
const passwordJar = browser();
await call(passwordJar, loginPOST, "/api/auth/login", { usernameOrEmail: eve.email, password: PASSWORD });
r = await call(passwordJar, resetPOST, "/api/auth/reset-password", { password: "brand-new-password-1" });
check("an ordinary password session (no code) can't reset", r.status === 403 && account(eve.email)!.passwordFingerprint === before);
r = await verify(resetJar, { email: eve.email, code: resetCode, type: "recovery" });
check("right reset code -> 200 next reset_password, signed in", r.status === 200 && r.json?.next === "reset_password" && hasSession(resetJar), JSON.stringify(r.json));
check("checking the code alone changes nothing", account(eve.email)!.passwordFingerprint === before);
r = await call(resetJar, resetPOST, "/api/auth/reset-password", { password: "short" });
check("password rules still apply", r.status === 400 && account(eve.email)!.passwordFingerprint === before);
r = await call(resetJar, resetPOST, "/api/auth/reset-password", { password: "brand-new-password-1" });
check("new password saved", r.status === 200 && account(eve.email)!.passwordFingerprint !== before, JSON.stringify(r.json));
const refreshed = await anon().auth.refreshSession({ refresh_token: otherDevice.refresh_token });
check("the other device's session is signed out", !!refreshed.error);
r = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: eve.email, password: PASSWORD });
check("old password refused", r.status === 400);
r = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: eve.email, password: "brand-new-password-1" });
check("new password works", r.status === 200 && r.json?.ok === true);
r = await verify(browser(), { email: eve.email, code: resetCode, type: "recovery" });
check("the reset code can't be used twice", r.status === 400);
r = await verify(browser(), { email: addr("nobody-forgot"), code: "123456", type: "recovery" });
check("reset code for an unknown address -> the same invalid_code answer", r.status === 400 && JSON.stringify(r.json) === wrongBody);

section("Email link fallback (instead of the code)");
const fay = await signUp("fay");
const link = await latestLink(fay.email, "signup");
check("the sign-up email also has the link, returning to the onboarding flow", decodeURIComponent(link).includes("flow=onboarding-verification"));
const landed = (await fetch(link, { redirect: "manual" })).headers.get("location") ?? "";
const pkce = new URL(landed).searchParams.get("code");
r = await call(fay.jar, callbackGET as never, `/auth/callback?flow=onboarding-verification&code=${pkce}`, undefined, { method: "GET" });
check("link -> callback -> Email Confirmed, signed in", new URL(r.location ?? "", "http://x").pathname === "/start/confirmed" && hasSession(fay.jar) && account(fay.email)!.confirmed, r.location ?? "");
r = await call(browser(), callbackGET as never, `/auth/callback?flow=onboarding-verification&error=access_denied`, undefined, { method: "GET" });
check("a bad link -> Email Confirmed with error (page sends to Log in)", (r.location ?? "").includes("/start/confirmed?error=invalid_link"));
sentAt = Date.now() - 1000;
await pastThrottle();
await call(browser(), forgotPOST, "/api/auth/forgot-password", { email: fay.email, next: "/start" });
await latestCode(fay.email, RESET_MAIL, sentAt);
const resetLink = await latestLink(fay.email, "recovery");
check("the reset email's link returns to Set a new password", decodeURIComponent(resetLink).includes("flow=onboarding-recovery"));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
