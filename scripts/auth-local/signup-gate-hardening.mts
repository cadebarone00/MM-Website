// G4 hardening (owner request 2026-10-30): concurrency of age-pass redemption, logins made around the hook, and hook
// failure modes, against the ISOLATED gate stack only (Supabase Auth runs the Before User Created hook there):
//   AUTH_LOCAL_STACK=gate node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=gate npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/signup-gate-hardening.mts
// The failure-mode section temporarily replaces the hook function ON THIS LOCAL STACK ONLY and always restores it.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { account, addr, admin, API, browser, call, q, sql, status } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

const stack = authLocalStack();
if (stack.name !== "gate") throw new Error("Run with AUTH_LOCAL_STACK=gate (the stack with the hook switched on).");
process.env.MAROON_V2_ONBOARDING = "on";

const { POST: ageCheckPOST } = await import("../../app/api/auth/age-check/route.ts");
const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: birthdayPOST } = await import("../../app/api/account/birthday/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { POST: profilePOST } = await import("../../app/api/account/profile/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");
const { POST: tripsPOST } = await import("../../app/api/golf-trips/route.ts");

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const PASSWORD = "gate-hardening-pass-1";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const allow = (email: string) => sql(`insert into public.signup_allowlist (email_normalized) values (${q(email.toLowerCase())}) on conflict do nothing`);
const logins = (email: string) => Number(sql(`select count(*) from auth.users where email = ${q(email.toLowerCase())}`));
/** psql in its OWN session (a separate process), so several really run at the same time. */
const psqlAsync = (query: string) => new Promise<string>((done) => {
  const child = spawn("docker", ["exec", stack.dbContainer, "psql", "-U", "postgres", "-t", "-A", "-c", query]);
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d)); child.on("close", () => done(out.trim()));
});
async function pass(email?: string) {
  const r = await call(browser(), ageCheckPOST, "/api/auth/age-check", { birthdate: "1990-06-15", client: "app" });
  const nonce = r.json?.agePass as string;
  if (email) sql(`select public.bind_age_pass(${q(sha(nonce))}, ${q(email)})`);
  return nonce;
}
async function directSignup(email: string, agePass?: string) {
  const r = await fetch(`${API}/auth/v1/signup`, { method: "POST", headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, ...(agePass ? { data: { age_pass: agePass } } : {}) }) });
  return { status: r.status, text: await r.text() };
}
const startMode = sql("select mode from public.registration_settings");
sql("update public.registration_settings set mode = 'testers'");

try {
  section("3. Concurrent redemption: one pass, one sign-up");
  {
    const email = addr("race-db"); allow(email);
    const nonce = await pass(email);
    const event = (id: string) => JSON.stringify({ user: { id, email, app_metadata: { provider: "email" }, user_metadata: { age_pass: nonce } } });
    const results = await Promise.all(Array.from({ length: 12 }, () => psqlAsync(`select coalesce(public.before_user_created_gate(${q(event(randomUUID()))}::jsonb)::text, 'null')`)));
    const allowed = results.filter((r) => r === "{}").length;
    check("12 simultaneous hook calls with the same pass -> exactly 1 allowed", allowed === 1, `${allowed} allowed`);
    check("the pass is used exactly once", sql(`select count(*) from public.age_passes where nonce_hash = ${q(sha(nonce))} and used_at is not null`) === "1");
  }
  {
    const email = addr("race-api"); allow(email);
    const nonce = await pass(email);
    const results = await Promise.all(Array.from({ length: 8 }, () => directSignup(email, nonce)));
    check("8 simultaneous public-API sign-ups, same email + pass -> exactly 1 login", logins(email) === 1, results.map((r) => r.status).join(","));
    const others = Array.from({ length: 6 }, (_, i) => addr(`race-other-${i}`)); others.forEach(allow);
    const nonce2 = await pass(others[0]);
    await Promise.all(others.map((e) => directSignup(e, nonce2)));
    check("6 simultaneous sign-ups for 6 allowlisted emails sharing ONE pass -> only its bound email gets a login",
      logins(others[0]) === 1 && others.slice(1).every((e) => logins(e) === 0));
  }
  {
    const nonce = await pass();
    const emails = Array.from({ length: 10 }, (_, i) => addr(`bind-race-${i}`));
    const results = await Promise.all(emails.map((e) => psqlAsync(`select public.bind_age_pass(${q(sha(nonce))}, ${q(e)})`)));
    check("10 simultaneous binds of one unbound pass to 10 emails -> exactly 1 succeeds", results.filter((r) => r === "t").length === 1, results.join(""));
  }
  {
    const email = addr("race-profile"); allow(email);
    const nonce = await pass(email);
    await directSignup(email, nonce);
    const id = account(email)!.id;
    sql(`update auth.users set email_confirmed_at = now() where id = ${q(id)}`);
    await Promise.all(Array.from({ length: 6 }, () => psqlAsync(`select public.initialize_my_profile(${q(id)})`)));
    check("6 simultaneous profile creations for one login -> 1 profile, 1 birthday, pass gone",
      sql(`select (select count(*) from public.profiles where id = ${q(id)}) || '/' || (select count(*) from public.account_birthdates where account_id = ${q(id)}) || '/' || (select count(*) from public.age_passes where account_id = ${q(id)})`) === "1/1/0");
  }

  section("4. Logins made around the hook (service-role / admin API) never become golfers");
  for (const [label, allowlisted] of [["admin-API login", false], ["admin-API login of an allowlisted tester", true]] as const) {
    const email = addr(allowlisted ? "admin-tester" : "admin-plain");
    if (allowlisted) allow(email);
    const made = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    check(`${label}: created by the admin API (the hook does not run there)`, !made.error && !!made.data.user, made.error?.message);
    const id = made.data.user!.id;
    const token = (await createClient(API, status.ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: PASSWORD })).data.session!.access_token;
    const bearer = { headers: { authorization: `Bearer ${token}` } };
    let r = await call(browser(), birthdayPOST, "/api/account/birthday", { birthdate: "1990-01-01" }, bearer);
    check(`${label}: self-declared birthday refused (403 age_check_required), nothing stored`, r.status === 403 && r.json?.code === "age_check_required"
      && sql(`select count(*) from public.account_birthdates where account_id = ${q(id)}`) === "0", `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(browser(), initializePOST, "/api/account/initialize", {}, bearer);
    check(`${label}: profile refused (403)`, r.status === 403, JSON.stringify(r.json));
    r = await call(browser(), profilePOST, "/api/account/profile", { displayName: "Around Hook", username: `around_${Date.now() % 100000}` }, bearer);
    check(`${label}: name + username refused (403), no profile`, r.status === 403 && sql(`select count(*) from public.profiles where id = ${q(id)}`) === "0", `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(browser(), finishPOST, "/api/account/finish", {}, bearer);
    check(`${label}: Finish does not activate`, r.json?.activated !== true && sql(`select count(*) from public.profiles where id = ${q(id)} and activated_at is not null`) === "0", `${r.status} ${JSON.stringify(r.json)}`);
    r = await call(browser(), onboardingGET as never, "/api/account/onboarding", undefined, { method: "GET", ...bearer });
    check(`${label}: onboarding never says Play`, r.json?.next !== "play", JSON.stringify(r.json));
    const jar = browser();
    await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password: PASSWORD });
    r = await call(jar, tripsPOST, "/api/golf-trips", { name: "Around the hook", destination: "Nowhere", startDate: "2027-05-01", endDate: "2027-05-03" });
    check(`${label}: creating a golf trip is refused, no trip`, r.status >= 400 && sql(`select count(*) from public.golf_trips where created_by = ${q(id)}`) === "0", `${r.status} ${JSON.stringify(r.json)}`);
    check(`${label}: no tester activation`, sql(`select count(*) from public.tester_activations where account_id = ${q(id)}`) === "0");
  }

  section("5. Hook failures: registration must fail closed");
  /** Lock 2 for a login that got past a broken hook: confirm it, then try to give it a profile as the server would. */
  const lock2Holds = (email: string) => {
    const id = account(email)?.id;
    if (!id) return true;
    sql(`update auth.users set email_confirmed_at = now() where id = ${q(id)}`);
    sql(`do $$ begin perform public.initialize_my_profile(${q(id)}); exception when others then null; end $$`);
    return sql(`select count(*) from public.profiles where id = ${q(id)}`) === "0";
  };
  // Each case replaces the hook ON THIS LOCAL STACK with `body` (`real` = the renamed real function), then restores it.
  const hookCases: { label: string; body: string | null; mustRefuse: boolean }[] = [
    { label: "slow hook (3 s) running the REAL checks, no pass", body: "perform pg_sleep(3); return public.before_user_created_gate_real(event);", mustRefuse: true },
    { label: "hook raises a database error", body: "raise exception 'simulated database failure';", mustRefuse: true },
    { label: "hook function missing (unavailable)", body: null, mustRefuse: true },
    // Platform behaviour probes: a broken hook that ANSWERS "allow" (after 12 s), or answers NULL. Supabase decides what
    // those mean; whatever it does, the login must not become a golfer (lock 2).
    { label: "very slow hook (12 s) answering allow", body: "perform pg_sleep(12); return '{}'::jsonb;", mustRefuse: false },
    { label: "hook answering NULL", body: "return null;", mustRefuse: false },
  ];
  for (const { label, body, mustRefuse } of hookCases) {
    sql("alter function public.before_user_created_gate(jsonb) rename to before_user_created_gate_real");
    try {
      if (body !== null) {
        sql(`create function public.before_user_created_gate(event jsonb) returns jsonb language plpgsql security definer set search_path = public as $f$ begin ${body} end $f$;
             grant execute on function public.before_user_created_gate(jsonb) to supabase_auth_admin`);
      }
      const tag = label.replace(/[^a-z]+/gi, "-").slice(0, 24).toLowerCase();
      const email = addr(`fail-${tag}`); allow(email);
      const started = Date.now();
      const r = await directSignup(email, mustRefuse ? undefined : await pass(email));
      const ms = Date.now() - started;
      if (mustRefuse) {
        check(`${label}: public API -> refused, no login`, r.status >= 400 && logins(email) === 0, `${r.status} after ${ms} ms: ${r.text.slice(0, 70)}`);
        const outsider = addr(`fail-app-${tag}`); // not allowlisted: the real checks must still say no
        const jar = browser();
        await call(jar, ageCheckPOST, "/api/auth/age-check", { birthdate: "1990-06-15" });
        const app = await call(jar, signupPOST, "/api/auth/signup", { email: outsider, password: PASSWORD });
        check(`${label}: app sign-up -> error reply, no login`, app.status >= 400 && logins(outsider) === 0, `${app.status} ${JSON.stringify(app.json)}`);
      } else {
        console.log(`  INFO  ${label}: Supabase Auth ${logins(email) ? `CREATED the login (status ${r.status} after ${ms} ms): it treats this answer as allow` : `refused (status ${r.status} after ${ms} ms)`}`);
        check(`${label}: any login that got through can never get a profile (lock 2)`, lock2Holds(email));
      }
    } finally {
      sql("drop function if exists public.before_user_created_gate(jsonb)");
      sql("alter function public.before_user_created_gate_real(jsonb) rename to before_user_created_gate");
    }
  }
  // Our real hook must never answer NULL (Supabase may read NULL as allow): odd and malformed events all get an answer.
  const odd = ["{}", '{"user": null}', '{"user": {}}', '{"user": {"email": ""}}', '{"user": {"email": "x@y.z", "id": "not-a-uuid", "user_metadata": {"age_pass": 5}}}',
    '{"user": {"email": "x@y.z", "is_anonymous": "maybe"}}'];
  const answers = odd.map((e) => sql(`select coalesce((select public.before_user_created_gate(${q(e)}::jsonb))::text, 'NULL')`));
  check("the real hook answers every odd / malformed event with an error object (never NULL, never allow)", answers.every((a) => a.startsWith('{"error"')), answers.join(" | ").slice(0, 160));
  const outsiderRestore = addr("after-restore");
  const restored = await directSignup(outsiderRestore);
  check("real hook restored afterwards (refuses with its own text)", restored.status === 403 && /invite-only|birthday/.test(restored.text) && logins(outsiderRestore) === 0, restored.text.slice(0, 80));
} finally {
  sql(`update public.registration_settings set mode = ${q(startMode)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
