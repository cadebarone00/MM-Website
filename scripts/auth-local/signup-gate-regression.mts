// G4 sign-up gate (supabase/signup_gate.sql; docs/v2-auth-enforcement-spec-2026-10-30.md) against the ISOLATED gate stack,
// whose Supabase Auth runs the Before User Created hook:
//   AUTH_LOCAL_STACK=gate node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=gate npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/signup-gate-regression.mts
// Attacks go straight to Supabase's PUBLIC sign-up endpoint with the browser key (what anyone can do), not only through
// the app's screens. Every check names the bypass test it covers (B1-B13).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { account, addr, admin, API, browser, call, MAIL, q, sql, status, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

if (authLocalStack().name !== "gate") throw new Error("Run with AUTH_LOCAL_STACK=gate (the stack with the hook switched on).");
process.env.MAROON_V2_ONBOARDING = "on";

const { POST: ageCheckPOST } = await import("../../app/api/auth/age-check/route.ts");
const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: verifyPOST } = await import("../../app/api/auth/verify-code/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: forgotPOST } = await import("../../app/api/auth/forgot-password/route.ts");
const { POST: resetPOST } = await import("../../app/api/auth/reset-password/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { POST: profilePOST } = await import("../../app/api/account/profile/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const PASSWORD = "gate-test-password-1";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const passes = () => Number(sql("select count(*) from public.age_passes"));
const logins = () => Number(sql("select count(*) from auth.users"));
const setMode = (mode: string) => sql(`update public.registration_settings set mode = ${q(mode)}`);
const allow = (email: string) => sql(`insert into public.signup_allowlist (email_normalized) values (${q(email.toLowerCase())}) on conflict do nothing`);
const years = (n: number, extraDays = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() + extraDays); return d.toISOString().slice(0, 10); };

/** The PUBLIC Supabase sign-up endpoint, called directly with the browser (anon) key: no app involved. */
async function directSignup(email: string, agePass?: string) {
  const r = await fetch(`${API}/auth/v1/signup`, { method: "POST", headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, ...(agePass ? { data: { age_pass: agePass } } : {}) }) });
  const text = await r.text();
  return { status: r.status, text, created: account(email) !== null };
}
/** A genuine pass from the app route (client: app returns it in the body). */
async function appPass(birthdate = years(30)) {
  const r = await call(browser(), ageCheckPOST, "/api/auth/age-check", { birthdate, client: "app" });
  return r.json?.agePass as string | undefined;
}
async function latestCode(email: string, subject: string, after = 0): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json() as { messages: { ID: string; Subject: string; Created: string }[] };
    const newest = (list.messages ?? []).filter((m) => m.Subject.includes(subject) && Date.parse(m.Created) > after).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${newest.ID}`)).json() as { Text?: string; HTML?: string };
      const code = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(/code in The Maroon:\s*(?:<strong>)?(\d{6})/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no "${subject}" code email for ${email}`);
}
const hasSession = (jar: Jar) => [...jar.keys()].some((k) => k.includes("auth-token") && !k.includes("code-verifier"));

/** The full website flow: Birthday -> Sign up -> code -> profile -> name. Returns the browser and account id. */
async function websiteSignup(email: string) {
  const jar = browser();
  const age = await call(jar, ageCheckPOST, "/api/auth/age-check", { birthdate: years(25) });
  const sent = Date.now() - 1000;
  const up = await call(jar, signupPOST, "/api/auth/signup", { email, password: PASSWORD, next: "/onboarding" });
  return { jar, age, up, sent };
}

section("Mode 'closed' (the default): nobody can register");
check("default mode is closed", sql("select mode from public.registration_settings") === "closed");
{
  const before = logins();
  const r = await directSignup(addr("closed-direct"));
  check("B7 direct API sign-up while closed -> refused, no login", r.status >= 400 && !r.created && logins() === before, `${r.status} ${r.text.slice(0, 90)}`);
  const email = addr("closed-tester"); allow(email);
  const w = await websiteSignup(email);
  check("B7 allowlisted tester with a valid pass while closed -> refused 'Registration is closed.'", w.up.status === 403 && w.up.json?.error === "Registration is closed." && !account(email), JSON.stringify(w.up.json));
}

setMode("testers");
section("Mode 'testers': direct API attacks (public endpoint, browser key)");
const tester = addr("tester-one"), tester2 = addr("tester-two"), outsider = addr("outsider");
for (const e of [tester, tester2, addr("tester-three"), addr("tester-four"), addr("tester-five"), addr("tester-six")]) allow(e);
{
  let r = await directSignup(tester);
  check("B1 no age pass -> refused, no login", r.status >= 400 && !r.created, `${r.status} ${r.text.slice(0, 90)}`);
  check("B1 the refusal is the hook's fixed text", r.text.includes("Start with your birthday."));
  r = await directSignup(tester, randomBytes(32).toString("hex"));
  check("B2 forged pass (random 64 hex) -> refused", r.status >= 400 && !r.created);
  r = await directSignup(tester, "not-a-pass");
  check("B2 malformed pass -> refused", r.status >= 400 && !r.created);
  const unbound = await appPass();
  r = await directSignup(tester, unbound);
  check("B5 genuine pass never bound to an email (skipping the app's sign-up step) -> refused", r.status >= 400 && !r.created);
  const boundToThree = await appPass();
  sql(`select public.bind_age_pass(${q(sha(boundToThree!))}, ${q(addr("tester-three"))})`);
  r = await directSignup(addr("tester-four"), boundToThree);
  check("B5 pass bound to email A used for email B -> refused", r.status >= 400 && !r.created);
  const expired = await appPass();
  sql(`select public.bind_age_pass(${q(sha(expired!))}, ${q(addr("tester-five"))}); update public.age_passes set expires_at = now() - interval '1 minute' where nonce_hash = ${q(sha(expired!))}`);
  r = await directSignup(addr("tester-five"), expired);
  check("B4 expired pass -> refused", r.status >= 400 && !r.created);
  const forOutsider = await appPass();
  sql(`select public.bind_age_pass(${q(sha(forOutsider!))}, ${q(outsider)})`);
  r = await directSignup(outsider, forOutsider);
  check("B6 valid, bound pass but email NOT on the allowlist -> refused 'invite-only'", r.status >= 400 && !r.created && r.text.includes("invite-only"), r.text.slice(0, 90));
  // A pass the server really issued and bound to this email: the direct call is then as good as the app's (same proof).
  const legit = await appPass();
  sql(`select public.bind_age_pass(${q(sha(legit!))}, ${q(addr("tester-three"))})`);
  r = await directSignup(addr("tester-three"), legit);
  check("genuine pass bound to this allowlisted email -> allowed (the hook accepts proof, not the caller)", r.status === 200 && r.created, `${r.status} ${r.text.slice(0, 90)}`);
  r = await directSignup(addr("tester-six"), legit);
  check("B3 the same pass replayed for another sign-up -> refused (single use)", r.status >= 400 && !r.created);
}

section("Under 13: nothing stored (B9)");
{
  const before = passes();
  const jar = browser();
  let r = await call(jar, ageCheckPOST, "/api/auth/age-check", { birthdate: years(13, 1) });
  check("B9 one day short of 13 -> not eligible, neutral message", r.status === 200 && r.json?.eligible === false && /not eligible/.test(String(r.json?.error ?? "")));
  check("B9 no pass row, no hash, no cookie", passes() === before && ![...jar.keys()].includes("maroon_age_pass"));
  r = await call(jar, ageCheckPOST, "/api/auth/age-check", { birthdate: years(13) });
  check("13th birthday today -> eligible, website gets an HttpOnly cookie (not the nonce in the body)", r.json?.eligible === true && jar.has("maroon_age_pass") && !("agePass" in (r.json ?? {})));
  r = await call(browser(), ageCheckPOST, "/api/auth/age-check", { birthdate: "2099-01-01" });
  check("future date -> 400", r.status === 400);
  const appR = await call(browser(), ageCheckPOST, "/api/auth/age-check", { birthdate: years(13, 1), client: "app" });
  check("B13 app path under 13 -> not eligible, no pass in the reply", appR.json?.eligible === false && !appR.json?.agePass);
  check("B9 the birthdate is never stored in Auth metadata", sql("select count(*) from auth.users where raw_user_meta_data::text ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'") === "0");
}

section("Website sign-up through the app (birthday first), verification, profile");
let testerId = "";
{
  const noPass = await call(browser(), signupPOST, "/api/auth/signup", { email: tester, password: PASSWORD, next: "/onboarding" });
  check("sign-up without the birthday step -> 400 age_check_required", noPass.status === 400 && noPass.json?.code === "age_check_required");
  const w = await websiteSignup(tester);
  check("birthday -> sign-up -> 200 'check your email'", w.age.json?.eligible === true && w.up.status === 200, JSON.stringify(w.up.json));
  check("the pass cookie is cleared after sign-up", !w.jar.has("maroon_age_pass") || w.jar.get("maroon_age_pass") === "");
  testerId = account(tester)!.id;
  check("the pass is used and tied to the new login", sql(`select count(*) from public.age_passes where account_id = ${q(testerId)} and used_at is not null`) === "1");
  const code = await latestCode(tester, "Confirm your email", w.sent);
  const v = await call(w.jar, verifyPOST, "/api/auth/verify-code", { email: tester, code, type: "signup" });
  check("6-digit code verifies and signs in", v.status === 200 && hasSession(w.jar), JSON.stringify(v.json));
  check("profile created at verification", sql(`select count(*) from public.profiles where id = ${q(testerId)}`) === "1");
  check("birthdate moved into account_birthdates (write-once store)", sql(`select count(*) from public.account_birthdates where account_id = ${q(testerId)}`) === "1");
  check("pass deleted and age_pass removed from the login's metadata", sql(`select count(*) from public.age_passes where account_id = ${q(testerId)}`) === "0"
    && sql(`select coalesce(raw_user_meta_data ->> 'age_pass', '') from auth.users where id = ${q(testerId)}`) === "");
  const resume = await call(w.jar, onboardingGET as never, "/api/account/onboarding", undefined, { method: "GET" });
  check("onboarding resumes at Name (the Birthday step is already done)", resume.json?.next === "name_username", JSON.stringify(resume.json));
  const name = await call(w.jar, profilePOST, "/api/account/profile", { displayName: "Gate Tester", username: `gate_tester_${Date.now() % 100000}` });
  check("name + username saved", name.status === 200, JSON.stringify(name.json));
  sql(`select public.set_rounds_visibility(${q(testerId)}, 'public')`);

  section("Tester activation without final Terms (switch off, no legal versions)");
  check("activation switch is off and no legal versions exist", sql("select activation_enabled from public.account_activation_settings") === "f" && sql("select count(*) from public.legal_document_versions") === "0");
  const f = await call(w.jar, finishPOST, "/api/account/finish", {});
  check("Finish activates the allowlisted tester", f.status === 200 && f.json?.activated === true, JSON.stringify(f.json));
  check("tester_activations says 'not_accepted_preview'", sql(`select terms_status from public.tester_activations where account_id = ${q(testerId)}`) === "not_accepted_preview");
  check("NO Terms / Privacy acceptance was recorded", sql(`select count(*) from public.terms_acceptances where account_id = ${q(testerId)}`) === "0");

  section("Password recovery still works with the gate on");
  const resetJar = browser(), sent = Date.now() - 1000;
  let r = await call(resetJar, forgotPOST, "/api/auth/forgot-password", { email: tester, next: "/start" });
  const resetCode = await latestCode(tester, "Reset your Maroon password", sent);
  r = await call(resetJar, verifyPOST, "/api/auth/verify-code", { email: tester, code: resetCode, type: "recovery" });
  check("recovery code accepted", r.status === 200, JSON.stringify(r.json));
  r = await call(resetJar, resetPOST, "/api/auth/reset-password", { password: "gate-test-password-2" });
  check("new password saved", r.status === 200, JSON.stringify(r.json));
  r = await call(browser(), loginPOST, "/api/auth/login", { usernameOrEmail: tester, password: "gate-test-password-2" });
  check("log in with the new password", r.status === 200, JSON.stringify(r.json));
  check("no new login was created by recovery / log-in", sql(`select count(*) from auth.users where email = ${q(tester)}`) === "1");
}

section("Second lock: a login made AROUND the hook can never get a profile (B8, B11)");
{
  const viaAdmin = addr("admin-made");
  const made = await admin.auth.admin.createUser({ email: viaAdmin, password: PASSWORD, email_confirm: true });
  console.log(`  INFO  B8 admin API createUser with the service key: ${made.error ? `refused by the hook (${made.error.message})` : "created (the hook does NOT run for the admin API)"}`);
  if (!made.error) {
    const token = (await (await import("@supabase/supabase-js")).createClient(API, status.ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: viaAdmin, password: PASSWORD })).data.session?.access_token;
    const r = await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: `Bearer ${token}` } });
    check("B8 admin-made login: profile refused (403 age_check_required), no profile row", r.status === 403 && r.json?.code === "age_check_required"
      && sql(`select count(*) from public.profiles where id = ${q(made.data.user!.id)}`) === "0", JSON.stringify(r.json));
  } else check("B8 admin API refused by the hook", true);
  const noHookId = randomUUID();
  // B11 stand-in: a login row written directly (as if the hook had been switched off), then initialize as the server would.
  sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', ${q(noHookId)}, 'authenticated', 'authenticated', ${q(addr("no-hook"))}, '', now(), '{"provider":"email"}', '{}', now(), now())`);
  const out = sql(`do $$ begin perform public.initialize_my_profile(${q(noHookId)}); raise notice 'created'; exception when others then raise notice 'refused: %', sqlerrm; end $$`);
  check("B11 login created with the hook bypassed: initialize_my_profile refused, no profile",
    sql(`select count(*) from public.profiles where id = ${q(noHookId)}`) === "0", out);
}

{
  const { POST: invitePOST } = await import("../../app/api/portal/admin/invite/route.ts");
  const r = await call(browser(), invitePOST, "/api/portal/admin/invite", { playerSlug: "any" });
  check("B8 the only app route using the admin API (V1 player invite) is closed while V2 is on (410)", r.status === 410, JSON.stringify(r.json));
}

section("Apple / Google and other providers (B10)");
{
  const ev = (provider: string, extra: Record<string, unknown> = {}) => sql(`select public.before_user_created_gate(${q(JSON.stringify({ user: { email: tester2, app_metadata: { provider }, user_metadata: {}, ...extra } }))}::jsonb) ->> 'error'`);
  check("B10 new Google account -> refused by the hook", ev("google").includes("only be created with email"));
  check("B10 new Apple account -> refused by the hook", ev("apple").includes("only be created with email"));
  check("anonymous sign-up -> refused", ev("email", { is_anonymous: true }).includes("only be created with email"));
  check("phone provider -> refused", ev("phone").includes("only be created with email"));
  check("only Supabase Auth may call the hook (browser roles can't)", sql("select has_function_privilege('anon', 'public.before_user_created_gate(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.before_user_created_gate(jsonb)', 'execute')") === "f"
    && sql("select has_function_privilege('supabase_auth_admin', 'public.before_user_created_gate(jsonb)', 'execute')") === "t");
  check("browser keys can't read or write the gate tables", sql("select bool_or(has_table_privilege(r, t, 'select') or has_table_privilege(r, t, 'insert')) from unnest(array['anon','authenticated']) r, unnest(array['public.age_passes','public.signup_allowlist','public.registration_settings','public.tester_activations']) t") === "f");
}

section("Mode 'open': no allowlist, the age pass is still required");
setMode("open");
{
  const email = addr("public-person");
  const r = await directSignup(email);
  check("open: direct API without a pass -> still refused", r.status >= 400 && !r.created);
  const w = await websiteSignup(email);
  check("open: not on the allowlist, birthday first -> allowed", w.up.status === 200 && account(email) !== null, JSON.stringify(w.up.json));
  const code = await latestCode(email, "Confirm your email", w.sent);
  await call(w.jar, verifyPOST, "/api/auth/verify-code", { email, code, type: "signup" });
  const id = account(email)!.id;
  await call(w.jar, profilePOST, "/api/account/profile", { displayName: "Gate Public", username: `gate_public_${Date.now() % 100000}` });
  sql(`select public.set_rounds_visibility(${q(id)}, 'public')`);
  const f = await call(w.jar, finishPOST, "/api/account/finish", {});
  check("open: a NON-tester can't use the tester shortcut (switch off -> not activated)", f.json?.activated !== true && sql(`select activated_at is null from public.profiles where id = ${q(id)}`) === "t", JSON.stringify(f.json));

  section("Pending accounts are not discoverable");
  const found = (term: string) => sql(`select public.search_golfers(${q(id)}, ${q(term)})::text`);
  check("search finds the Active tester", found("Gate Tester").includes(testerId));
  const viewer = testerId;
  check("search does NOT find the Pending account", !sql(`select public.search_golfers(${q(viewer)}, 'Gate Public')::text`).includes(id));
}
setMode("closed");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
