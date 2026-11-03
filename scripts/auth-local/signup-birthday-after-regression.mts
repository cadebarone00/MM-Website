// Sign-up order: birthday AFTER the account is made (owner decision 2026-11-02; supabase/signup_gate_birthday_after.sql;
// project_specs.md "Sign-up order: birthday AFTER account creation"). Runs against the ISOLATED gate stack, whose Supabase
// Auth runs the Before User Created hook:
//   AUTH_LOCAL_STACK=gate node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=gate npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/signup-birthday-after-regression.mts
// Supersedes the age-pass checks of signup-gate-regression.mts (B1-B5, B9, B11, B13 tested birthday-first).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { account, addr, API, browser, call, MAIL, q, sql, status, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

const stack = authLocalStack();
if (stack.name !== "gate") throw new Error("Run with AUTH_LOCAL_STACK=gate (the stack with the hook switched on).");
process.env.MAROON_V2_ONBOARDING = "on";
execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("supabase/signup_gate_birthday_after.sql") });

const { POST: ageCheckPOST } = await import("../../app/api/auth/age-check/route.ts");
const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: verifyPOST } = await import("../../app/api/auth/verify-code/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: profilePOST } = await import("../../app/api/account/profile/route.ts");
const { POST: birthdayPOST } = await import("../../app/api/account/birthday/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const PASSWORD = "after-test-password-1";
const logins = () => Number(sql("select count(*) from auth.users"));
const setMode = (mode: string) => sql(`update public.registration_settings set mode = ${q(mode)}`);
const allow = (email: string) => sql(`insert into public.signup_allowlist (email_normalized) values (${q(email.toLowerCase())}) on conflict do nothing`);
const ymd = (yearsBack: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - yearsBack); return d.toISOString().slice(0, 10); };
const hasSession = (jar: Jar) => [...jar.keys()].some((k) => k.includes("auth-token") && !k.includes("code-verifier"));
const resume = async (jar: Jar) => (await call(jar, onboardingGET as never, "/api/account/onboarding", undefined, { method: "GET" })).json?.next;

async function directSignup(email: string) {
  const r = await fetch(`${API}/auth/v1/signup`, { method: "POST", headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }) });
  return { status: r.status, text: await r.text(), created: account(email) !== null };
}
async function latestCode(email: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json() as { messages: { ID: string; Subject: string; Created: string }[] };
    const newest = (list.messages ?? []).filter((m) => m.Subject.includes("Confirm your email") && Date.parse(m.Created) > after).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${newest.ID}`)).json() as { Text?: string; HTML?: string };
      const code = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(/code in The Maroon:\s*(?:<strong>)?(\d{6})/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no sign-up code email for ${email}`);
}
/** Website: Sign up (email + password) -> 6-digit code -> Name. No birthday anywhere before this. */
async function signUpVerifyName(email: string, label: string) {
  const jar = browser(), sent = Date.now() - 1000;
  const up = await call(jar, signupPOST, "/api/auth/signup", { email, password: PASSWORD, next: "/onboarding" });
  const code = await latestCode(email, sent);
  const verified = await call(jar, verifyPOST, "/api/auth/verify-code", { email, code, type: "signup" });
  const nextAfterVerify = await resume(jar);
  const name = await call(jar, profilePOST, "/api/account/profile", { displayName: `After ${label}`, username: `after_${label}_${Date.now() % 100000}` });
  return { jar, up, verified, nextAfterVerify, name, id: account(email)?.id ?? "" };
}

const modeBefore = sql("select mode from public.registration_settings");
const switchBefore = sql("select activation_enabled from public.account_activation_settings");
try {
  section("Database: the age-pass locks are gone, the hook keeps its other rules");
  check("no require_age_pass_for_profile / guard_post_gate_birthdate triggers",
    sql("select count(*) from pg_trigger where tgname in ('require_age_pass_for_profile', 'guard_post_gate_birthdate')") === "0");
  check("only Supabase Auth may call the hook", sql("select has_function_privilege('anon', 'public.before_user_created_gate(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.before_user_created_gate(jsonb)', 'execute') or has_function_privilege('service_role', 'public.before_user_created_gate(jsonb)', 'execute')") === "f"
    && sql("select has_function_privilege('supabase_auth_admin', 'public.before_user_created_gate(jsonb)', 'execute')") === "t");
  const ev = (provider: string, extra: Record<string, unknown> = {}) => sql(`select coalesce(public.before_user_created_gate(${q(JSON.stringify({ user: { email: addr("provider"), app_metadata: { provider }, user_metadata: {}, ...extra } }))}::jsonb) -> 'error' ->> 'message', 'allowed')`);
  setMode("open");
  check("new Google account -> refused (email only)", ev("google").includes("only be created with email"));
  check("new Apple account -> refused (email only)", ev("apple").includes("only be created with email"));
  check("anonymous sign-up -> refused", ev("email", { is_anonymous: true }).includes("only be created with email"));
  check("email, mode open, no age pass -> allowed", ev("email") === "allowed");

  section("Mode 'closed': nobody can register");
  setMode("closed");
  let before = logins();
  let r = await directSignup(addr("closed"));
  check("closed: direct API sign-up refused, no login", r.status >= 400 && !r.created && logins() === before && r.text.includes("Registration is closed."), `${r.status} ${r.text.slice(0, 90)}`);

  section("Mode 'testers': only allowlisted emails");
  setMode("testers");
  before = logins();
  r = await directSignup(addr("outsider"));
  check("not on the allowlist -> refused 'invite-only', no login", r.status >= 400 && !r.created && logins() === before && r.text.includes("invite-only"), `${r.status} ${r.text.slice(0, 90)}`);
  const site = await call(browser(), signupPOST, "/api/auth/signup", { email: addr("outsider-site"), password: PASSWORD });
  check("…same through the website sign-up (403, the hook's own words)", site.status === 403 && site.json?.error === "Registration is invite-only right now.", JSON.stringify(site.json));

  section("Adult tester: Sign up -> code -> Name -> Birthday -> Finish");
  sql("delete from public.legal_document_versions; update public.account_activation_settings set activation_enabled = false");
  const adultEmail = addr("adult"); allow(adultEmail);
  const adult = await signUpVerifyName(adultEmail, "adult");
  check("sign-up with email + password only (no birthday first) -> 200", adult.up.status === 200 && !!adult.id, JSON.stringify(adult.up.json));
  check("6-digit code verifies and signs in", adult.verified.status === 200 && hasSession(adult.jar), JSON.stringify(adult.verified.json));
  check("after the code: next step is Name", adult.nextAfterVerify === "name_username", String(adult.nextAfterVerify));
  check("name + username saved, profile exists, no birthday stored yet", adult.name.status === 200
    && sql(`select count(*) from public.profiles where id = ${q(adult.id)}`) === "1"
    && sql(`select count(*) from public.account_birthdates where account_id = ${q(adult.id)}`) === "0", JSON.stringify(adult.name.json));
  check("after Name: next step is Birthday", (await resume(adult.jar)) === "birthday");
  const early = await call(adult.jar, finishPOST, "/api/account/finish", {});
  check("Finish before the birthday -> refused, not activated", early.json?.activated !== true && sql(`select activated_at is null from public.profiles where id = ${q(adult.id)}`) === "t", JSON.stringify(early.json));
  const bday = await call(adult.jar, birthdayPOST, "/api/account/birthday", { birthdate: ymd(25) });
  check("birthday 25 years ago -> eligible", bday.status === 200 && bday.json?.eligible === true, JSON.stringify(bday.json));
  check("birthday stored once (self)", sql(`select source from public.account_birthdates where account_id = ${q(adult.id)}`) === "self");
  const again = await call(adult.jar, birthdayPOST, "/api/account/birthday", { birthdate: ymd(40) });
  check("birthday can't be changed by the person (write-once)", again.status === 409, JSON.stringify(again.json));
  sql(`select public.set_rounds_visibility(${q(adult.id)}, 'public')`);
  const fin = await call(adult.jar, finishPOST, "/api/account/finish", {});
  check("Finish activates the allowlisted tester", fin.status === 200 && fin.json?.activated === true, JSON.stringify(fin.json));
  check("…and the account is Active (next = play)", (await resume(adult.jar)) === "play");

  section("Under-13 tester: the account is never finalized");
  const kidEmail = addr("kid"); allow(kidEmail);
  const kid = await signUpVerifyName(kidEmail, "kid");
  check("kid reaches the Birthday step like everyone else", kid.up.status === 200 && kid.name.status === 200 && (await resume(kid.jar)) === "birthday");
  const kb = await call(kid.jar, birthdayPOST, "/api/account/birthday", { birthdate: ymd(10) });
  check("birthday 10 years ago -> not eligible, signed out", kb.status === 200 && kb.json?.eligible === false && kb.json?.signedOut === true, JSON.stringify(kb.json));
  check("the reply never echoes the date", !JSON.stringify(kb.json).match(/\d{4}-\d{2}-\d{2}/));
  check("this browser's session is gone", !hasSession(kid.jar));
  const kidLeft = sql(`select count(*) from auth.users where id = ${q(kid.id)}`);
  const kidActive = sql(`select count(*) from public.profiles where id = ${q(kid.id)} and activated_at is not null`);
  check("the login is removed (or locked for review) and never activated", kidActive === "0"
    && (kidLeft === "0" || sql(`select status from public.account_eligibility where account_id = ${q(kid.id)}`) !== ""), `logins left ${kidLeft}`);
  const login = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: kidEmail, password: PASSWORD });
  check("logging back in doesn't reach Play", login.status !== 200 || login.json?.next !== "play", JSON.stringify(login.json));

  section("Retired birthday-first endpoint");
  const age = await call(browser(), ageCheckPOST, "/api/auth/age-check", { birthdate: ymd(30) });
  check("POST /api/auth/age-check -> 410 retired", age.status === 410 && age.json?.code === "retired", JSON.stringify(age.json));
} finally {
  setMode(modeBefore);
  sql(`update public.account_activation_settings set activation_enabled = ${switchBefore === "t"}`);
}

console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILURES"}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
