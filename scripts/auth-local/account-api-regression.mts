// Pending accounts Phase 3: the account onboarding APIs (birthday, finish, onboarding resume, birthday-correction, terms)
// through their REAL route handlers against the ISOLATED local Supabase, with web cookie and app Bearer sessions.
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/account-api-regression.mts
// Installs supabase/account_activation.sql on the isolated stack only and switches activation on/off THERE to test both;
// a test legal version is set there too (never on a hosted project).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { addr, admin, anon, browser, call, confirmByEmail, account, q, sql, type Jar } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";

const { POST: signupPOST } = await import("../../app/api/auth/signup/route.ts");
const { POST: loginPOST } = await import("../../app/api/auth/login/route.ts");
const { POST: setupPOST } = await import("../../app/api/account/profile/route.ts");
const { POST: initializePOST } = await import("../../app/api/account/initialize/route.ts");
const { POST: birthdayPOST } = await import("../../app/api/account/birthday/route.ts");
const { POST: finishPOST } = await import("../../app/api/account/finish/route.ts");
const { GET: onboardingGET } = await import("../../app/api/account/onboarding/route.ts");
const { POST: correctionPOST } = await import("../../app/api/account/birthday-correction/route.ts");
const { GET: termsGET, POST: termsPOST } = await import("../../app/api/account/terms/route.ts");

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
type Json = Record<string, unknown>;
type Who = { jar?: Jar; token?: string };
const opts = (who: Who, extra: Record<string, string> = {}) => ({ headers: { ...(who.token ? { authorization: `Bearer ${who.token}` } : {}), ...extra } });
const jarOf = (who: Who) => who.jar ?? browser();
const birthday = (who: Who, body: unknown) => call(jarOf(who), birthdayPOST, "/api/account/birthday", body, opts(who));
const finish = (who: Who) => call(jarOf(who), finishPOST, "/api/account/finish", {}, opts(who));
const resume = (who: Who) => call(jarOf(who), onboardingGET as never, "/api/account/onboarding", undefined, { method: "GET", ...opts(who) });
const correction = (who: Who, reason: unknown) => call(jarOf(who), correctionPOST, "/api/account/birthday-correction", { reason }, opts(who));
const terms = (who: Who, body: unknown) => call(jarOf(who), termsPOST, "/api/account/terms", body, opts(who));
const VERSIONS = { termsVersion: "local-test", privacyVersion: "local-test" };
const ymd = (yearsBack: number, daysBack = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - yearsBack); d.setUTCDate(d.getUTCDate() - daysBack); return d.toISOString().slice(0, 10); };
const setActivation = (on: boolean) => sql(`update public.account_activation_settings set activation_enabled = ${on}`);
const hasNoDate = (x: unknown) => !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(x));

execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("supabase/account_activation.sql") });
const switchBefore = sql("select activation_enabled from public.account_activation_settings");
sql(`insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
  on conflict (document) do update set current_version = excluded.current_version;`);
const golden = () => sql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
  select row_to_json(m)::text x from public.golf_trip_members m union all select row_to_json(s)::text from public.player_slots s
  union all select row_to_json(r)::text from public.player_rounds r union all select row_to_json(t)::text from public.golf_trips t) z`);
const goldenBefore = golden();

/** Email sign-up through the app: verified, signed in with a cookie; also a Bearer token for the same account. */
async function emailPerson(name: string, setup = false) {
  const email = addr(name), password = "account-api-pass-1", jar = browser();
  await call(jar, signupPOST, "/api/auth/signup", { email, password });
  await confirmByEmail(email);
  await call(jar, loginPOST, "/api/auth/login", { usernameOrEmail: email, password });
  if (setup) await call(jar, setupPOST, "/api/account/profile", { displayName: `${name} Golfer`, username: `${name.replace(/-/g, "_")}_${Date.now() % 100000}` });
  const token = (await anon().auth.signInWithPassword({ email, password })).data.session!.access_token;
  return { id: account(email)!.id, email, password, jar, token };
}
/** An Apple/Google-style account: provider-verified (no email link), app_metadata.provider = google, Bearer only. */
async function providerPerson(name: string) {
  const email = addr(name), password = "provider-pass-not-used-by-person-1";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { provider: "google", providers: ["google"] } });
  const token = (await anon().auth.signInWithPassword({ email, password })).data.session!.access_token;
  await call(browser(), initializePOST, "/api/account/initialize", {}, { headers: { authorization: `Bearer ${token}` } });
  return { id: created.data.user!.id, token };
}

section("Missing or invalid authentication, cross-site cookie requests");
{
  const none: Who = {};
  for (const [label, r] of [["birthday", await birthday(none, { birthdate: "1990-01-01" })], ["finish", await finish(none)], ["onboarding", await resume(none)],
    ["correction", await correction(none, "x")], ["terms", await terms(none, VERSIONS)]] as const) {
    check(`${label}: no session -> 401 signed_out`, r.status === 401 && r.json?.code === "signed_out", JSON.stringify(r.json));
  }
  const bad = await finish({ token: "not-a-real-token" });
  check("invalid Bearer token -> 401, nothing activated", bad.status === 401, JSON.stringify(bad.json));
  const victim = await emailPerson("api-xsite", true);
  const xs = await call(victim.jar, birthdayPOST, "/api/account/birthday", { birthdate: "1990-01-01" }, { headers: { origin: "https://evil.example" } });
  check("cookie POST from another site -> 403 cross_site, nothing saved", xs.status === 403 && xs.json?.code === "cross_site"
    && sql(`select count(*) from public.account_birthdates where account_id = ${q(victim.id)}`) === "0", JSON.stringify(xs.json));
}

section("Email account (cookie): resume step by step, Finish while disabled, incomplete, then active");
const ann = await emailPerson("api-email");
{
  let r = await resume(ann);
  check("new verified account resumes at name_username", r.status === 200 && r.json?.state === "pending" && r.json?.next === "name_username", JSON.stringify(r.json));
  setActivation(false);
  const disabled = await finish(ann);
  check("Finish while the switch is off -> 503 activation_disabled", disabled.status === 503 && disabled.json?.code === "activation_disabled", JSON.stringify(disabled.json));
  setActivation(true);
  const incomplete = await finish(ann);
  const missing = (incomplete.json?.missing ?? []) as string[];
  check("Finish with incomplete setup -> 409 incomplete, lists name, username, birthday, terms, privacy",
    incomplete.status === 409 && ["name", "username", "birthday", "terms", "privacy"].every((m) => missing.includes(m)), JSON.stringify(incomplete.json));
  check("nothing activated by the failed Finish", sql(`select activated_at is null from public.profiles where id = ${q(ann.id)}`) === "t");
  await call(ann.jar, setupPOST, "/api/account/profile", { displayName: "Ann Golfer", username: `ann_${Date.now() % 100000}` });
  r = await resume(ann);
  check("after name + username -> birthday", r.json?.next === "birthday", JSON.stringify(r.json));
  for (const badDate of ["2015-02-30", "15/02/2000", "", "2999-01-01", "1899-12-31"]) {
    const b = await birthday(ann, { birthdate: badDate });
    check(`invalid birthdate ${JSON.stringify(badDate)} -> 400`, b.status === 400 && b.json?.code === "invalid_birthdate", JSON.stringify(b.json));
  }
  const thirteen = await birthday(ann, { birthdate: ymd(13), accountId: "00000000-0000-4000-8000-000000000000" });
  check("exactly 13 today -> eligible (body account id ignored)", thirteen.status === 200 && thirteen.json?.eligible === true, JSON.stringify(thirteen.json));
  check("reply never contains the date", hasNoDate(thirteen.json));
  const again = await birthday(ann, { birthdate: "1980-01-01" });
  check("repeated birthday -> 409 birthday_already_saved, date unchanged", again.status === 409 && again.json?.code === "birthday_already_saved"
    && sql(`select birthdate = ${q(ymd(13))}::date from public.account_birthdates where account_id = ${q(ann.id)}`) === "t", JSON.stringify(again.json));
  r = await resume(ann);
  check("after birthday -> terms", r.json?.next === "terms", JSON.stringify(r.json));
  const versions = await call(browser(), termsGET as never, "/api/account/terms", undefined, { method: "GET" });
  check("GET terms -> current version names only", versions.status === 200 && versions.json?.terms === "local-test" && versions.json?.privacy === "local-test", JSON.stringify(versions.json));
  const stale = await terms(ann, { termsVersion: "old", privacyVersion: "local-test" });
  check("accepting an old version -> 409 version_mismatch", stale.status === 409 && stale.json?.code === "version_mismatch", JSON.stringify(stale.json));
  const accepted = await terms(ann, VERSIONS);
  check("accepting current versions -> 200", accepted.status === 200, JSON.stringify(accepted.json));
  check("recorded server-side with method signup", sql(`select string_agg(document || ':' || version || ':' || method, ',' order by document) from public.terms_acceptances where account_id = ${q(ann.id)}`)
    === "privacy:local-test:signup,terms:local-test:signup");
  r = await resume(ann);
  check("everything required done -> settings (Finish lives there)", r.json?.next === "settings" && r.json?.activationAvailable === true, JSON.stringify(r.json));
  const done = await finish(ann);
  check("Finish -> 200 activated (not already)", done.status === 200 && done.json?.activated === true && done.json?.already === false, JSON.stringify(done.json));
  r = await resume(ann);
  check("active -> next play", r.json?.state === "active" && r.json?.next === "play", JSON.stringify(r.json));
  const twice = await finish(ann);
  check("repeated Finish -> 200 already", twice.status === 200 && twice.json?.already === true, JSON.stringify(twice.json));
  check("still exactly one profile", sql(`select count(*) from public.profiles where id = ${q(ann.id)}`) === "1");
}

section("Concurrent Finish (five at once, cookie + Bearer mixed)");
{
  const ben = await emailPerson("api-race", true);
  await birthday(ben, { birthdate: "1990-09-09" });
  await terms(ben, VERSIONS);
  const results = await Promise.all([finish(ben), finish({ token: ben.token }), finish(ben), finish({ token: ben.token }), finish(ben)]);
  check("all five succeed", results.every((x) => x.status === 200 && x.json?.activated === true), JSON.stringify(results.map((x) => x.status)));
  check("exactly one performed the activation", results.filter((x) => x.json?.already === false).length === 1, JSON.stringify(results.map((x) => x.json?.already)));
}

section("Provider-authenticated account (Bearer only, no email link)");
{
  const gil = await providerPerson("api-google");
  const who = { token: gil.token };
  let r = await resume(who);
  check("provider account resumes at name_username (verified by provider)", r.json?.next === "name_username", JSON.stringify(r.json));
  sql(`update public.profiles set display_name = 'Gil Golfer', username = ${q(`gil_${Date.now() % 100000}`)} where id = ${q(gil.id)}`);
  check("birthday via Bearer -> eligible", (await birthday(who, { birthdate: "1988-08-08" })).json?.eligible === true);
  check("terms via Bearer -> 200", (await terms(who, VERSIONS)).status === 200);
  check("recorded with method oauth", sql(`select string_agg(distinct method, ',') from public.terms_acceptances where account_id = ${q(gil.id)}`) === "oauth");
  const done = await finish(who);
  check("Finish via Bearer -> 200 activated", done.status === 200 && done.json?.activated === true, JSON.stringify(done.json));
  r = await resume(who);
  check("provider account active -> play", r.json?.next === "play");
}

section("Resume after interruption (new session, same account)");
{
  const cal = await emailPerson("api-resume", true);
  await birthday(cal, { birthdate: "1995-05-05" });
  const fresh = (await anon().auth.signInWithPassword({ email: cal.email, password: cal.password })).data.session!.access_token;
  const r = await resume({ token: fresh });
  check("app reopened with a new token -> same next step (terms)", r.json?.next === "terms" && r.json?.state === "pending", JSON.stringify(r.json));
}

section("Under 13: Ineligible and blocked; correction request with duplicate + rate limits");
{
  const kid = await emailPerson("api-kid", true);
  const b = await birthday(kid, { birthdate: ymd(13, -1) });
  check("13 tomorrow -> 200 eligible false, next ineligible", b.status === 200 && b.json?.eligible === false && b.json?.next === "ineligible", JSON.stringify(b.json));
  check("account is Ineligible in the database", sql(`select public.account_lifecycle_state(${q(kid.id)})`) === "ineligible");
  const r = await resume(kid);
  check("resume -> ineligible, never play", r.json?.state === "ineligible" && r.json?.next === "ineligible", JSON.stringify(r.json));
  const f = await finish(kid);
  check("Finish -> 403 not_eligible", f.status === 403 && f.json?.code === "not_eligible", JSON.stringify(f.json));
  check("terms -> 403 not_eligible", (await terms(kid, VERSIONS)).json?.code === "not_eligible");
  check("birthday again -> 403 not_eligible (no retry)", (await birthday(kid, { birthdate: "1990-01-01" })).json?.code === "not_eligible");
  check("Bearer is blocked the same way", (await finish({ token: kid.token })).json?.code === "not_eligible");
  check("never activated", sql(`select activated_at is null from public.profiles where id = ${q(kid.id)}`) === "t");
  check("empty reason -> 400", (await correction(kid, "  ")).status === 400);
  const c1 = await correction(kid, "I typed the wrong year");
  check("correction request -> 200 received (no date in reply)", c1.status === 200 && c1.json?.status === "received" && hasNoDate(c1.json), JSON.stringify(c1.json));
  check("duplicate while open -> 409 already_open", (await correction(kid, "again")).json?.code === "already_open");
  check("request changes nothing about the birthday", sql(`select birthdate = ${q(ymd(13, -1))}::date and source = 'self' from public.account_birthdates where account_id = ${q(kid.id)}`) === "t");
  const adminId = (await emailPerson("api-admin", true)).id;
  sql(`update public.profiles set platform_role = 'admin' where id = ${q(adminId)}`);
  const reject = () => sql(`select public.admin_reject_birthdate_correction(${q(adminId)}, (select id from public.birthdate_corrections where account_id = ${q(kid.id)} and status = 'open'))`);
  reject();
  check("second request after the first was decided -> 200", (await correction(kid, "second try")).status === 200);
  reject();
  check("third request -> 200", (await correction(kid, "third try")).status === 200);
  reject();
  const limited = await correction(kid, "fourth try");
  check("fourth request within 30 days -> 429 too_many_requests", limited.status === 429 && limited.json?.code === "too_many_requests", JSON.stringify(limited.json));
}

section("Restricted and legacy accounts");
{
  const held = await emailPerson("api-review", true);
  sql(`insert into public.account_eligibility (account_id, status, reason) values (${q(held.id)}, 'review', 'manual')`);
  check("restricted: resume -> restricted", (await resume(held)).json?.next === "restricted");
  check("restricted: Finish -> 403 restricted", (await finish(held)).json?.code === "restricted");
  const vet = await emailPerson("api-legacy", true);
  sql(`select set_config('maroon.activation', 'on', false); update public.profiles set activated_at = now() where id = ${q(vet.id)};`);
  let r = await resume(vet);
  check("legacy active without birthday -> resume birthday", r.json?.state === "active_needs_birthday" && r.json?.next === "birthday", JSON.stringify(r.json));
  const f = await finish(vet);
  check("legacy Finish -> 409 incomplete [birthday]", f.status === 409 && JSON.stringify(f.json?.missing) === '["birthday"]', JSON.stringify(f.json));
  check("legacy birthday -> eligible", (await birthday(vet, { birthdate: "1975-03-03" })).json?.eligible === true);
  r = await resume(vet);
  check("legacy after birthday -> play", r.json?.state === "active" && r.json?.next === "play", JSON.stringify(r.json));
}

section("Account isolation");
{
  const a = await emailPerson("api-iso-a", true);
  const b = await emailPerson("api-iso-b", true);
  await birthday(a, { birthdate: "1991-01-01", account_id: b.id, p_account: b.id, userId: b.id });
  check("A's request with B's id in the body only changed A", sql(`select count(*) from public.account_birthdates where account_id = ${q(b.id)}`) === "0"
    && sql(`select count(*) from public.account_birthdates where account_id = ${q(a.id)}`) === "1");
  check("B still resumes at birthday", (await resume(b)).json?.next === "birthday");
  const mixed = await call(b.jar, finishPOST, "/api/account/finish", {}, { headers: { authorization: `Bearer ${a.token}` } });
  check("B's cookie + A's Bearer at once is refused or acts as A only (never B)", mixed.status !== 200 || sql(`select activated_at is null from public.profiles where id = ${q(b.id)}`) === "t", JSON.stringify(mixed.json));
}

section("Missing migration / unavailable database");
try {
  sql("alter function public.account_lifecycle_state(uuid) rename to account_lifecycle_state_hidden; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
  for (const [label, r] of [["onboarding", await resume(ann)], ["finish", await finish(ann)], ["birthday", await birthday(ann, { birthdate: "1990-01-01" })],
    ["correction", await correction(ann, "x")], ["terms", await terms(ann, VERSIONS)]] as const) {
    check(`${label}: lifecycle function missing -> 503 unavailable (never active)`, r.status === 503 && r.json?.code === "unavailable", JSON.stringify(r.json));
  }
} finally {
  sql("alter function public.account_lifecycle_state_hidden(uuid) rename to account_lifecycle_state; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
}
try {
  const dee = await emailPerson("api-nobday", true);
  sql("alter function public.set_my_birthdate(uuid, date) rename to set_my_birthdate_hidden; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
  const r = await birthday(dee, { birthdate: "1990-01-01" });
  check("birthday function missing -> 503 unavailable", r.status === 503 && r.json?.code === "unavailable", JSON.stringify(r.json));
} finally {
  sql("alter function public.set_my_birthdate_hidden(uuid, date) rename to set_my_birthdate; notify pgrst, 'reload schema';");
  await new Promise((r) => setTimeout(r, 2500));
}
check("lifecycle restored", (await resume(ann)).json?.next === "play");

section("Golf records untouched");
check("trips, memberships, player slots and rounds byte-identical", golden() === goldenBefore);

sql(`update public.account_activation_settings set activation_enabled = ${switchBefore === "t"}`);
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
