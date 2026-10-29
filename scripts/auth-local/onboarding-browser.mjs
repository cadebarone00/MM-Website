// Pending accounts Phase 6: browser end-to-end tests of the REAL sign-up / onboarding screens (/start/*, /onboarding/*),
// in Chromium at phone size, against a Next dev server pointed at the ISOLATED local Supabase stack (never a hosted one).
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main node scripts/auth-local/onboarding-browser.mjs
// Three server runs on port 3999 (the stack's site URL), each with its own build folder under out/:
//   A. MAROON_V2_ONBOARDING unset            → every new screen and the code API are 404; the dev previews still work.
//   B. onboarding on + MAROON_ACCOUNT_ENFORCEMENT=on → full flows, resume, under-13, reset, link fallback, Finish failure.
//   C. onboarding on, enforcement off       → the same sign-up still reaches Play.
// On THIS stack only: account_activation.sql + auth_code_attempts.sql are installed, a test legal version is set and the
// activation switch is turned on (restored afterwards). tsconfig.json / next-env.d.ts are restored byte-for-byte (Next
// rewrites them for a custom build folder).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { authLocalStack } from "./stack.mjs";

const stack = authLocalStack();
const statusText = execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json", "--workdir", stack.workdir], { shell: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
const status = JSON.parse(statusText.slice(statusText.indexOf("{"), statusText.lastIndexOf("}") + 1));
const API = status.API_URL, MAIL = status.MAILPIT_URL ?? status.INBUCKET_URL;
if (API !== stack.api || !MAIL?.startsWith(stack.mail)) throw new Error(`Refusing to run: not the isolated local stack "${stack.name}"`);
// localhost, not 127.0.0.1: under `next dev` request.url names localhost, and the app builds email-link redirects from it,
// so the browser, its cookies and the server must all use the same host (found 2026-10-29).
const PORT = 3999, ORIGIN = `http://localhost:${PORT}`;
const sql = (query) => execFileSync("docker", ["exec", stack.dbContainer, "psql", "-U", "postgres", "-t", "-A", "-F", "|", "-c", query]).toString().trim();
const psql = (file) => execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync(file) });
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const run = Date.now().toString(36);
const addr = (name) => `${name}-${run}@auth-local.test`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0, passed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function step(name, fn) {
  try { await fn(); } catch (error) { check(name, false, String(error?.message ?? error).split("\n")[0].slice(0, 300)); }
}

// === Stack preparation (isolated stack only) ===
psql("supabase/account_activation.sql");
psql("supabase/auth_code_attempts.sql");
const switchBefore = sql("select activation_enabled from public.account_activation_settings");
const setActivation = (on) => sql(`update public.account_activation_settings set activation_enabled = ${on}`);
sql(`insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
  on conflict (document) do update set current_version = excluded.current_version`);
sql("notify pgrst, 'reload schema'");
const accountRow = (email) => {
  const row = sql(`select u.id, u.email_confirmed_at is not null, p.activated_at is not null, coalesce(p.username, ''), md5(coalesce(u.encrypted_password, ''))
    from auth.users u left join public.profiles p on p.id = u.id where u.email = ${q(email)}`);
  if (!row) return null;
  const [id, confirmed, activated, username, password] = row.split("|");
  return { id, confirmed: confirmed === "t", activated: activated === "t", username, password };
};

async function latestCode(email, subject, after) {
  for (let i = 0; i < 60; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const newest = (list.messages ?? []).filter((m) => m.Subject.includes(subject) && Date.parse(m.Created) > after)
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${newest.ID}`)).json();
      const code = `${full.Text ?? ""} ${full.HTML ?? ""}`.match(/code in The Maroon:\s*(?:<strong>)?(\d{6})/);
      const link = `${full.HTML ?? ""}`.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/);
      if (code) return { code: code[1], link: link ? link[1].replace(/&amp;/g, "&") : null };
    }
    await sleep(250);
  }
  throw new Error(`no "${subject}" email for ${email}`);
}
/** activated_at exactly as the app reads it (PostgREST's format), for building marker cookies. */
async function activatedAtOf(id) {
  const r = await fetch(`${API}/rest/v1/profiles?id=eq.${id}&select=activated_at`, { headers: { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` } });
  return (await r.json())[0]?.activated_at ?? null;
}
/** Moves an activation time (test setup only; the activation guard only lets Finish or this explicit flag change it). */
const setActivatedAt = (id, expression) => sql(`begin; select set_config('maroon.activation', 'on', true); update public.profiles set activated_at = ${expression} where id = ${q(id)}; commit;`);
const createdVisit = async (context) => {
  const r = await context.request.get(`${ORIGIN}/onboarding/created`, { maxRedirects: 0 });
  return { status: r.status(), to: r.headers().location ? new URL(r.headers().location, ORIGIN).pathname : null };
};
const SIGNUP_MAIL = "Confirm your email", RESET_MAIL = "Reset your Maroon password";
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

// === Next dev server ===
const originalTsconfig = readFileSync("tsconfig.json", "utf8");
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");
// Put both back however the run ends (finished, failed, Ctrl+C or killed by a time limit).
const restoreFiles = () => { writeFileSync("tsconfig.json", originalTsconfig); writeFileSync("next-env.d.ts", originalNextEnv); };
process.on("exit", restoreFiles);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
async function withServer(name, extraEnv, fn) {
  if (process.env.E2E_ONLY && !name.startsWith(process.env.E2E_ONLY)) return;
  console.log(`\n=== Server ${name} ===`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/SUPABASE|MAROON_/i.test(key)) delete env[key];
  Object.assign(env, { NEXT_BUILD_OUTPUT: `out/next-onboarding-e2e-${name}`, NEXT_TELEMETRY_DISABLED: "1",
    SUPABASE_URL: API, SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: API, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, ...extraEnv });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(PORT)], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (d) => { log = (log + d).slice(-20000); });
  server.stderr.on("data", (d) => { log = (log + d).slice(-20000); });
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < 180 && !/Ready in/.test(log); i++) {
      if (server.exitCode !== null) throw new Error(`server exited: ${log.slice(-2000)}`);
      await sleep(1000);
    }
    assert.ok(/Ready in/.test(log), "server ready");
    await fn(browser);
  } catch (error) {
    check(`server ${name} run`, false, String(error?.message ?? error).slice(0, 400));
  } finally {
    await browser.close();
    server.kill();
    await sleep(1500);
    if (/Error:|⨯/.test(log)) console.log(`  (server ${name} log tail)\n${log.split("\n").filter((l) => /Error|⨯/.test(l)).slice(-8).join("\n")}`);
  }
}
async function phone(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  context.setDefaultTimeout(90000);
  context.setDefaultNavigationTimeout(180000);
  const page = await context.newPage();
  // E2E_DEBUG=1: print every API / callback answer (status + path) to see where a flow stops.
  if (process.env.E2E_DEBUG) page.on("response", (r) => { const u = new URL(r.url()); if (/^\/(api|auth)\//.test(u.pathname)) console.log(`    · ${r.request().method()} ${u.pathname}${u.search.replace(/code=[^&]+/, "code=…")} -> ${r.status()}${r.status() >= 400 && u.pathname.startsWith("/api/account") ? ` ${r.request().headers().origin ?? "(no origin)"}` : ""}`); if (r.status() >= 400 && u.pathname.startsWith("/api/account")) r.text().then((t) => console.log(`      ${t.slice(0, 200)}`)).catch(() => undefined); });
  return { context, page };
}
const path = (page) => new URL(page.url()).pathname;
async function waitPath(page, pathname) { await page.waitForURL((url) => url.pathname === pathname, { timeout: 120000 }); }

// === Screen helpers (what a person taps) ===
async function signUpToCode(page, email, password) {
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("link", { name: "Sign up" }).click();
  await waitPath(page, "/start/sign-up");
  await page.getByLabel("Email").fill(email);
  const sentAt = Date.now() - 1000;
  await page.getByRole("button", { name: "Continue" }).click();
  await waitPath(page, "/start/password");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await waitPath(page, "/start/verify");
  return latestCode(email, SIGNUP_MAIL, sentAt);
}
async function typeCode(page, code) {
  const input = page.locator('input[autocomplete="one-time-code"]');
  await input.fill("");
  await input.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}
async function nameStep(page, first, last) {
  await waitPath(page, "/onboarding/name");
  await page.getByLabel("First Name").fill(first);
  await page.getByLabel("Last Name").fill(last);
  await page.getByLabel("Username").fill(`${first}${run}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30));
  await page.getByRole("button", { name: "Continue" }).click();
  await waitPath(page, "/onboarding/birthday");
}
async function birthdayStep(page, year) {
  await page.getByRole("button", { name: "Pick your birthday" }).click();
  await page.getByLabel("Year").selectOption(String(year));
  await page.locator(`button[aria-label$="15 January ${year}"]`).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

// =====================================================================================================================
await withServer("A-off", {}, async (browser) => {
  const { page, context } = await phone(browser);
  for (const route of ["/start", "/start/sign-up", "/start/verify", "/onboarding", "/onboarding/name", "/onboarding/created"]) {
    const response = await context.request.get(ORIGIN + route, { maxRedirects: 0, timeout: 180000 });
    check(`flag off: ${route} -> 404`, response.status() === 404, String(response.status()));
  }
  const api = await context.request.post(`${ORIGIN}/api/auth/verify-code`, { data: { email: addr("off"), code: "123456", type: "signup" }, timeout: 180000 });
  check("flag off: POST /api/auth/verify-code -> 404", api.status() === 404);
  await page.goto(`${ORIGIN}/dev/auth/verification-code`);
  check("flag off: the dev preview still renders", await page.getByRole("heading", { name: "Email Verification" }).isVisible());
});

setActivation(true);
await withServer("B-enforced", { MAROON_V2_ONBOARDING: "on", MAROON_ACCOUNT_ENFORCEMENT: "on" }, async (browser) => {
  // --- Full email sign-up, with a wrong code first, resume on another device, Finish failure then success ---
  const ann = { email: addr("ann"), password: "browser-pass-ann-1" };
  const { page, context } = await phone(browser);
  await step("full sign-up flow", async () => {
    const { code } = await signUpToCode(page, ann.email, ann.password);
    check("sign-up -> password -> code screen; account exists unverified", !!accountRow(ann.email) && !accountRow(ann.email).confirmed);
    await typeCode(page, wrong(code));
    await page.getByRole("alert").filter({ hasText: "wrong or has expired" }).waitFor();
    check("wrong code: message shown, still on the code screen, not verified", path(page) === "/start/verify" && !accountRow(ann.email).confirmed);
    await typeCode(page, code);
    await waitPath(page, "/start/confirmed");
    check("right code -> Email confirmed", await page.getByRole("heading", { name: "Email confirmed" }).isVisible() && accountRow(ann.email).confirmed);
    check("Terms + Privacy recorded after verification", sql(`select count(*) from public.terms_acceptances where account_id = ${q(accountRow(ann.email).id)}`) === "2");
    await page.getByRole("link", { name: "Continue" }).click();
    await nameStep(page, "Ann", "Browser");
    check("name + username saved", accountRow(ann.email).username !== "");
    // Enforcement: a Pending account can't reach Play; it's sent to its step.
    await page.goto(`${ORIGIN}/`);
    await waitPath(page, "/onboarding/birthday");
    check("Pending -> Play is refused and sent to the next step (birthday)", true);
    const skip = await context.request.get(`${ORIGIN}/onboarding/created`, { maxRedirects: 0 });
    check("Profile Created before Finish -> redirected", skip.status() === 307 && skip.headers().location?.endsWith("/onboarding/birthday"), `${skip.status()} ${skip.headers().location}`);
    const back = await context.request.get(`${ORIGIN}/onboarding/name`, { maxRedirects: 0 });
    check("going back to a saved step bounces forward", back.status() === 307 && back.headers().location?.endsWith("/onboarding/birthday"));
    const api = await context.request.get(`${ORIGIN}/api/golf-trips`, { maxRedirects: 0 });
    check("Pending -> golf API refused (403 finish_onboarding)", api.status() === 403, String(api.status()));
  });

  await step("resume on another device", async () => {
    const other = await phone(browser);
    await other.page.goto(`${ORIGIN}/start/log-in`);
    await other.page.getByLabel("Email").fill(ann.email);
    await other.page.getByLabel("Password", { exact: true }).fill(ann.password);
    await other.page.getByRole("button", { name: "Log in" }).click();
    await waitPath(other.page, "/onboarding/birthday");
    check("log in elsewhere -> resumes at Birthday (from saved data)", true);
    await other.context.close();
  });

  await step("birthday, photo, settings, Finish", async () => {
    await birthdayStep(page, 1995);
    await waitPath(page, "/onboarding/photo");
    check("13+ birthday saved -> Photo", sql(`select count(*) from public.account_birthdates where account_id = ${q(accountRow(ann.email).id)}`) === "1");
    await page.getByRole("button", { name: "Skip for now" }).click();
    await waitPath(page, "/onboarding/settings");
    // Finish while the switch is off: recoverable message, nothing lost.
    setActivation(false);
    await page.getByRole("switch", { name: "Public profile" }).click();
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("alert").filter({ hasText: "isn't open yet" }).waitFor();
    check("Finish refused while activation is off: message, stays on Settings, not activated", path(page) === "/onboarding/settings" && !accountRow(ann.email).activated);
    check("…and the button can be pressed again", await page.getByRole("button", { name: "Finish" }).isEnabled());
    setActivation(true);
    const finishes = [];
    page.on("request", (r) => { if (r.url().endsWith("/api/account/finish")) finishes.push(r.method()); });
    const button = page.getByRole("button", { name: "Finish" });
    await button.click();
    await button.click({ force: true, timeout: 2000 }).catch(() => undefined); // a double tap
    await waitPath(page, "/onboarding/created");
    check("double tap -> exactly one Finish request", finishes.length === 1, String(finishes.length));
    check("activated only after Finish", accountRow(ann.email).activated);
    check("Public chosen on Settings is saved", sql(`select public.get_rounds_visibility(${q(accountRow(ann.email).id)})`) === "public");
    await page.getByRole("heading", { name: "Profile Created!" }).waitFor();
    await page.getByRole("link", { name: "Let's go" }).click();
    await waitPath(page, "/");
    check("Let's go -> Play", true);
    const again = await context.request.get(`${ORIGIN}/onboarding/settings`, { maxRedirects: 0 });
    check("Active: onboarding screens send to Play", again.status() === 307 && new URL(again.headers().location, ORIGIN).pathname === "/");

    // Profile Created is a one-time screen (Phase 7A marker).
    const id = accountRow(ann.email).id, activatedAt = await activatedAtOf(id);
    let visit = await createdVisit(context);
    check("after the screen was shown: revisiting Profile Created -> Play", visit.status === 307 && visit.to === "/", JSON.stringify(visit));
    check("…and the marker cookie is gone", !(await context.cookies()).some((c) => c.name === "maroon_just_activated"));
    const host = new URL(ORIGIN).hostname;
    await context.addCookies([{ name: "maroon_just_activated", value: "2020-01-01T00:00:00+00:00", domain: host, path: "/" }]);
    visit = await createdVisit(context);
    check("a made-up marker -> Play", visit.status === 307 && visit.to === "/", JSON.stringify(visit));
    setActivatedAt(id, "now() - interval '11 minutes'");
    const old = await activatedAtOf(id);
    await context.addCookies([{ name: "maroon_just_activated", value: old, domain: host, path: "/" }]);
    visit = await createdVisit(context);
    check("an expired marker (activation 11 minutes ago) -> Play", visit.status === 307 && visit.to === "/", JSON.stringify(visit));
    setActivatedAt(id, "now()");
    const fresh = await activatedAtOf(id);
    await context.addCookies([{ name: "maroon_just_activated", value: fresh, domain: host, path: "/" }]);
    visit = await createdVisit(context);
    check("the matching, fresh marker -> the screen is allowed (server-verified)", visit.status === 200, JSON.stringify(visit));
    check("visiting Profile Created never changes the activation", (await activatedAtOf(id)) === fresh);
    setActivatedAt(id, `${q(activatedAt)}::timestamptz`);
    await context.clearCookies({ name: "maroon_just_activated" });
  });

  await step("existing Active user", async () => {
    const other = await phone(browser);
    await other.page.goto(`${ORIGIN}/start/log-in`);
    await other.page.getByLabel("Email").fill(ann.email);
    await other.page.getByLabel("Password", { exact: true }).fill(ann.password);
    await other.page.getByRole("button", { name: "Log in" }).click();
    await waitPath(other.page, "/");
    await other.page.goto(`${ORIGIN}/onboarding/created`);
    await waitPath(other.page, "/");
    check("a returning Active user opening Profile Created goes to Play", !(await other.page.getByRole("heading", { name: "Profile Created!" }).isVisible()));
    await other.context.close();
  });
  await context.close();

  // --- Under 13 ---
  await step("under-13", async () => {
    const kid = { email: addr("kid"), password: "browser-pass-kid-1" };
    const { page: p, context: c } = await phone(browser);
    const { code } = await signUpToCode(p, kid.email, kid.password);
    await typeCode(p, code);
    await waitPath(p, "/start/confirmed");
    await p.getByRole("link", { name: "Continue" }).click();
    await nameStep(p, "Kid", "Browser");
    await birthdayStep(p, new Date().getUTCFullYear() - 5);
    await waitPath(p, "/account/status");
    check("under 13 -> eligibility message", await p.getByRole("heading", { name: "This account can't use The Maroon" }).isVisible());
    check("never activated; marked ineligible (or removed)", !accountRow(kid.email)?.activated
      && (sql(`select count(*) from public.account_eligibility e join auth.users u on u.id = e.account_id where u.email = ${q(kid.email)}`) === "1" || !accountRow(kid.email)));
    const after = await c.request.get(`${ORIGIN}/onboarding`, { maxRedirects: 0 });
    check("this browser is signed out", after.status() === 307 && after.headers().location?.endsWith("/start/log-in"));
    await c.close();
  });

  // --- Password reset by code ---
  await step("password reset", async () => {
    const { page: p, context: c } = await phone(browser);
    await p.goto(`${ORIGIN}/start/log-in`);
    await p.getByRole("link", { name: "Forgot password?" }).click();
    await waitPath(p, "/start/forgot");
    await p.getByLabel("Email").fill(ann.email);
    const sentAt = Date.now() - 1000;
    const before = accountRow(ann.email).password;
    await p.getByRole("button", { name: "Send code" }).click();
    await waitPath(p, "/start/reset-code");
    check("Enter Code To Reset shown", await p.getByRole("heading", { name: "Enter Code To Reset" }).isVisible());
    const { code } = await latestCode(ann.email, RESET_MAIL, sentAt);
    await typeCode(p, wrong(code));
    await p.getByRole("alert").filter({ hasText: "wrong or has expired" }).waitFor();
    check("wrong reset code: message, password unchanged", accountRow(ann.email).password === before);
    await typeCode(p, code);
    await waitPath(p, "/start/reset-password");
    check("code accepted -> Set a new password; password still unchanged", accountRow(ann.email).password === before);
    await p.getByLabel("Password", { exact: true }).fill("browser-new-pass-ann-2");
    await p.getByLabel("Confirm Password", { exact: true }).fill("browser-new-pass-ann-2");
    await p.getByRole("button", { name: "Save password" }).click();
    await waitPath(p, "/start/log-in");
    check("saved -> Log in with a notice", await p.getByText("Password saved. Log in with your new password.").isVisible() && accountRow(ann.email).password !== before);
    await p.getByLabel("Email").fill(ann.email);
    await p.getByLabel("Password", { exact: true }).fill("browser-new-pass-ann-2");
    await p.getByRole("button", { name: "Log in" }).click();
    await waitPath(p, "/");
    check("Active account logs in -> Play", true);
    await c.close();
  });

  // --- Wrong password, unverified log in, and the email link instead of the code ---
  await step("log in errors and link fallback", async () => {
    const { page: p, context: c } = await phone(browser);
    await p.goto(`${ORIGIN}/start/log-in`);
    await p.getByLabel("Email").fill(ann.email);
    await p.getByLabel("Password", { exact: true }).fill("not-the-password-123");
    await p.getByRole("button", { name: "Log in" }).click();
    await p.getByRole("alert").filter({ hasText: "Incorrect" }).waitFor();
    check("wrong password -> message, stays on Log in", path(p) === "/start/log-in");

    const fay = { email: addr("fay"), password: "browser-pass-fay-1" };
    const first = await signUpToCode(p, fay.email, fay.password);
    // Leave without verifying, then log in: sent back to the code screen with a fresh code.
    await p.goto(`${ORIGIN}/start/log-in`);
    await p.getByLabel("Email").fill(fay.email);
    await p.getByLabel("Password", { exact: true }).fill(fay.password);
    const sentAt = Date.now() - 1000;
    await sleep(1600); // the stack's 1s resend throttle
    await p.getByRole("button", { name: "Log in" }).click();
    await waitPath(p, "/start/verify");
    const fresh = await latestCode(fay.email, SIGNUP_MAIL, sentAt);
    check("unverified log in -> code screen, a new code was sent", /^\d{6}$/.test(fresh.code));
    // Open the email LINK in this browser instead of typing the code.
    await p.goto(fresh.link ?? first.link);
    await waitPath(p, "/start/confirmed");
    check("email link -> Email confirmed, verified", await p.getByRole("heading", { name: "Email confirmed" }).isVisible() && accountRow(fay.email).confirmed);
    await p.getByRole("link", { name: "Continue" }).click();
    await waitPath(p, "/onboarding/name");
    check("…and onboarding carries on at Name", true);
    await c.close();
  });

  await step("status page and blocked states", async () => {
    const { page: p, context: c } = await phone(browser);
    const r = await c.request.get(`${ORIGIN}/onboarding/name`, { maxRedirects: 0 });
    check("signed out -> onboarding sends to Log in", r.status() === 307 && r.headers().location?.endsWith("/start/log-in"));
    const confirmed = await c.request.get(`${ORIGIN}/start/confirmed`, { maxRedirects: 0 });
    check("Email confirmed without a session -> Log in with a message", confirmed.status() === 307 && confirmed.headers().location?.includes("/start/log-in?error=invalid_link"));
    const reset = await c.request.get(`${ORIGIN}/start/reset-password`, { maxRedirects: 0 });
    check("Set a new password without a code session -> Forgot password", reset.status() === 307 && reset.headers().location?.endsWith("/start/forgot"));
    await p.goto(`${ORIGIN}/start/verify`);
    await waitPath(p, "/start/sign-up");
    check("code screen without an email -> back to Sign up", true);
    await c.close();
  });
});

await withServer("C-unenforced", { MAROON_V2_ONBOARDING: "on" }, async (browser) => {
  await step("sign-up with enforcement off", async () => {
    const cy = { email: addr("cy"), password: "browser-pass-cy-1" };
    const { page, context } = await phone(browser);
    const { code } = await signUpToCode(page, cy.email, cy.password);
    await typeCode(page, code);
    await waitPath(page, "/start/confirmed");
    await page.getByRole("link", { name: "Continue" }).click();
    await nameStep(page, "Cy", "Browser");
    await birthdayStep(page, 1990);
    await waitPath(page, "/onboarding/photo");
    await page.getByRole("button", { name: "Skip for now" }).click();
    await waitPath(page, "/onboarding/settings");
    await page.getByRole("button", { name: "Finish" }).click();
    await waitPath(page, "/onboarding/created");
    check("enforcement off: same flow -> Profile Created, activated", accountRow(cy.email).activated);
    check("Private by default", sql(`select public.get_rounds_visibility(${q(accountRow(cy.email).id)})`) === "private");
    // Refresh: the screen used its marker once it showed, so reloading goes to Play and activates nothing again.
    const activatedAt = await activatedAtOf(accountRow(cy.email).id);
    await page.getByRole("heading", { name: "Profile Created!" }).waitFor();
    for (let i = 0; i < 40 && (await context.cookies()).some((c) => c.name === "maroon_just_activated"); i++) await sleep(250);
    check("the shown screen used up its marker", !(await context.cookies()).some((c) => c.name === "maroon_just_activated"));
    await page.reload();
    await waitPath(page, "/");
    check("refreshing Profile Created -> Play", path(page) === "/");
    await page.goto(`${ORIGIN}/onboarding/created`);
    await waitPath(page, "/");
    check("navigating back to it again -> Play", path(page) === "/");
    check("refresh / revisits never re-activate (activation time unchanged)", (await activatedAtOf(accountRow(cy.email).id)) === activatedAt);
    await context.close();
  });
});

setActivation(switchBefore === "t");
writeFileSync("tsconfig.json", originalTsconfig);
writeFileSync("next-env.d.ts", originalNextEnv);
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
