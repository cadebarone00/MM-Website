// End-to-end browser test: beta creator-access requests. Request → pending
// (duplicate handled) → platform admin approves → the requester can create;
// a denied request shows a neutral status. Runs against a real production
// build pointed at scripts/fake-supabase.mjs (all real migrations in an
// in-memory Postgres). Never touches a real database.
//
// Run from a directory with a finished `next build`:
//   node scripts/test-access-requests-browser.mjs      (SCREENSHOT_DIR=... to save screenshots)
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3107);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54401);
const app = `http://localhost:${APP_PORT}`;
const year = new Date().getFullYear();

const fake = await startFakeSupabase({ port: FAKE_PORT });
const casey = await fake.addUser({ name: "casey" });
const drew = await fake.addUser({ name: "drew" });
const admin = await fake.addUser({ name: "platformadmin", platformRole: "admin" });
const count = async (sql, params = []) => (await fake.db.query(sql, params)).rows[0].n;

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
async function signedIn(user, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ ...fake.sessionCookie(user), url: app }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return page;
}
const hydrated = (page) => page.waitForFunction(() => { const f = document.querySelector("main form"); return f && Object.keys(f).some((k) => k.startsWith("__reactProps")); });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/tournaments/new`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Signed out: sent to login; the API refuses.
  for (const path of ["/tournaments/request-access", "/admin/tournament-access"]) {
    const response = await fetch(`${app}${path}`, { redirect: "manual" });
    assert.ok([303, 307, 308].includes(response.status) && new URL(response.headers.get("location"), app).pathname === "/login", `${path}: signed out → login (${response.status})`);
  }
  assert.equal((await fetch(`${app}/api/platform/access-requests`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status, 401);
  assert.equal((await fetch(`${app}/api/platform/access-requests/review`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status, 404);

  // Entry points for someone not approved: empty My Tournaments and /tournaments/new both lead to Request access.
  const page = await signedIn(casey);
  await page.goto(`${app}/tournaments`);
  await page.getByRole("heading", { name: "No tournaments yet", exact: true }).waitFor();
  assert.equal(await page.getByRole("main").getByRole("link", { name: "Create Tournament", exact: true }).count(), 0, "no dead-end Create button");
  await page.goto(`${app}/tournaments/new`);
  const notice = page.getByRole("complementary", { name: "Creator access" });
  assert.ok((await notice.innerText()).includes("invite-only during the beta"));
  await notice.getByRole("link", { name: "Request access", exact: true }).click();
  await page.waitForURL("**/tournaments/request-access");

  // The form: email read-only from the account, name prefilled.
  await hydrated(page);
  assert.equal(await page.getByLabel("Email").inputValue(), casey.email);
  assert.equal(await page.getByLabel("Email").getAttribute("readonly"), "");
  assert.equal(await page.getByLabel("Your name").inputValue(), "casey");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Check these details." }).waitFor();
  await page.getByLabel("Your name").fill("Casey Hill");
  await page.getByLabel("Tournament or group name").fill("Hill Country Cup");
  await page.getByLabel("Approximate players").fill("16");
  await page.getByLabel("Location (optional)").fill("Kerrville, TX");
  await page.getByLabel("Tell us about your tournament (optional)").fill("Annual trip with friends.");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await page.getByRole("heading", { name: "Request received", exact: true }).waitFor();
  const received = await page.locator("main").innerText();
  for (const text of ["stays unavailable until your request is approved", "Hill Country Cup", `${year}`, "16", "Kerrville, TX"]) assert.ok(received.includes(text), `received page shows ${text}`);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/access-received.png`, fullPage: true });

  // Duplicate: reload shows the same status; a second submit returns it without a new row.
  await page.reload();
  await page.getByRole("heading", { name: "Request received", exact: true }).waitFor();
  const again = await page.request.post(`${app}/api/platform/access-requests`, { data: { requesterName: "Casey", groupName: "Another Cup", seasonYear: year, expectedPlayers: 8 } });
  assert.equal(again.status(), 200);
  const againBody = await again.json();
  assert.deepEqual([againBody.duplicate, againBody.access.request.groupName, againBody.access.canCreate], [true, "Hill Country Cup", false]);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(againBody)), "no internal ids to the browser");
  assert.equal(await count("select count(*)::int n from tournament_access_requests where profile_id = $1", [casey.id]), 1);
  assert.equal(await count("select count(*)::int n from tournament_creator_access where profile_id = $1", [casey.id]), 0, "a request grants nothing");
  await page.goto(`${app}/tournaments/new`);
  assert.ok((await page.getByRole("complementary", { name: "Creator access" }).innerText()).includes("being reviewed"));
  assert.equal((await page.goto(`${app}/admin/tournament-access`)).status(), 404, "requester can't open the admin review");
  assert.equal((await page.request.post(`${app}/api/platform/access-requests/review`, { data: { reference: 1, decision: "approved" } })).status(), 404, "requester can't approve themselves");

  // Drew requests too, and sees only their own request.
  const drewPage = await signedIn(drew);
  assert.equal((await drewPage.request.post(`${app}/api/platform/access-requests`, { data: { requesterName: "Drew", groupName: "Desert Classic", seasonYear: year, expectedPlayers: 12 } })).status(), 201);
  await drewPage.goto(`${app}/tournaments/request-access`);
  const drewText = await drewPage.locator("main").innerText();
  assert.ok(drewText.includes("Desert Classic") && !drewText.includes("Hill Country Cup"), "each person sees only their own request");

  // Platform admin: neutral platform page, not the Admin Center; approve Casey, deny Drew.
  const adminPage = await signedIn(admin);
  await adminPage.goto(`${app}/admin/tournament-access`);
  assert.match(await adminPage.locator("header").first().innerText(), /platform admin/i);
  assert.equal(await adminPage.locator("footer").count(), 0, "no Maroon chrome");
  assert.ok(!(await adminPage.locator("body").innerText()).includes("Defending Champions"));
  const caseyCard = adminPage.locator('[data-request="1"]');
  const caseyText = await caseyCard.innerText();
  for (const text of ["Hill Country Cup", "Casey Hill", casey.email, "Kerrville, TX", "Annual trip with friends.", "Pending"]) assert.ok(caseyText.includes(text), `admin sees ${text}`);
  await caseyCard.getByLabel("Decision note for request #1").fill("Welcome to the beta.");
  await caseyCard.getByRole("button", { name: "Approve request #1", exact: true }).click();
  await adminPage.getByRole("status").filter({ hasText: "Request #1 approved" }).waitFor();
  assert.equal(await adminPage.locator('[data-request="1"]').getAttribute("data-status"), "approved");
  await adminPage.locator('[data-request="2"]').getByLabel("Decision note for request #2").fill("Not in this beta wave.");
  await adminPage.locator('[data-request="2"]').getByRole("button", { name: "Deny request #2", exact: true }).click();
  await adminPage.getByRole("status").filter({ hasText: "Request #2 denied" }).waitFor();
  if (process.env.SCREENSHOT_DIR) await adminPage.screenshot({ path: `${process.env.SCREENSHOT_DIR}/access-admin.png`, fullPage: true });
  assert.equal((await fake.db.query("select status from tournament_creator_access where profile_id = $1", [casey.id])).rows[0]?.status, "approved", "approval activates creator access");
  assert.equal(await count("select count(*)::int n from tournament_creator_access where profile_id = $1", [drew.id]), 0, "denial grants nothing");
  assert.equal((await adminPage.request.post(`${app}/api/platform/access-requests/review`, { data: { reference: 1, decision: "denied" } })).status(), 409, "already reviewed");

  // Approved: Casey continues to create.
  await page.goto(`${app}/tournaments/request-access`);
  await page.getByRole("heading", { name: "You're approved", exact: true }).waitFor();
  assert.ok((await page.locator("main").innerText()).includes("Welcome to the beta."));
  await page.getByRole("main").getByRole("link", { name: "Create Tournament", exact: true }).click();
  await page.waitForURL("**/tournaments/new");
  assert.equal(await page.getByRole("complementary", { name: "Creator access" }).count(), 0, "no access notice once approved");
  await hydrated(page);
  await page.getByLabel("Tournament name", { exact: true }).fill("Hill Country Cup");
  await page.getByRole("button", { name: "Create now, finish later", exact: true }).click();
  await page.waitForURL(`**/tournaments/hill-country-cup/${year}`, { timeout: 30000 });

  // Denied: neutral status with a way to get in touch; no re-request loop.
  await drewPage.goto(`${app}/tournaments/request-access`);
  await drewPage.getByRole("heading", { name: "Request not approved", exact: true }).waitFor();
  assert.ok((await drewPage.locator("main").innerText()).includes("Not in this beta wave."));
  assert.equal(await drewPage.getByRole("main").getByRole("link", { name: "Contact us", exact: true }).getAttribute("href"), "/contact");
  assert.equal((await drewPage.request.post(`${app}/api/platform/access-requests`, { data: { requesterName: "Drew", groupName: "Again", seasonYear: year, expectedPlayers: 12 } })).status(), 409);

  // Phone: no sideways scroll.
  const phone = await signedIn(drew, { width: 390, height: 844 });
  for (const path of ["/tournaments/request-access", "/tournaments/new", "/tournaments"]) {
    await phone.goto(`${app}${path}`);
    assert.ok(await overflow(phone) <= 1, `no horizontal scroll on phone at ${path}`);
  }
  const phoneAdmin = await signedIn(admin, { width: 390, height: 844 });
  await phoneAdmin.goto(`${app}/admin/tournament-access`);
  assert.ok(await overflow(phoneAdmin) <= 1, "no horizontal scroll on phone at the admin review");

  assert.deepEqual(pageErrors, []);
  console.log("Passed (request access): signed out → login, entry points on My Tournaments and /tournaments/new, read-only account email, validation, request received, duplicate returns the same request, request grants nothing, requesters see only their own, requester can't open or call review, admin approves (creator access activated → can create) and denies (neutral status, contact, no re-request), already-reviewed refused, no Maroon chrome, phone width.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error("--- app server log (tail) ---\n" + serverLog.split("\n").slice(-40).join("\n"));
} finally {
  if (fake.unsupported.length) console.log("fake-supabase: unsupported calls seen (not used by the tested flow):", [...new Set(fake.unsupported)].slice(0, 10));
  await browser.close();
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
