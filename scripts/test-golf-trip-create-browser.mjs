// End-to-end browser check for Create Golf Trip: questionnaire → Review → Create → saved trip → Golf Trip Home,
// against a production build pointed at scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-golf-trip-create-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3108);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54402);
const app = `http://localhost:${APP_PORT}`;

const fake = await startFakeSupabase({ port: FAKE_PORT });
const cade = await fake.addUser({ name: "cade" });
const stranger = await fake.addUser({ name: "stranger" });
const count = async (table) => (await fake.db.query(`select count(*)::int n from ${table}`)).rows[0].n;

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const phone = async (user, width = 390) => {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  if (user) await context.addCookies([{ ...fake.sessionCookie(user), url: app }]);
  return context.newPage();
};

/** Fills every questionnaire step and lands on Review. */
async function fillQuestionnaire(p) {
  const next = () => p.getByRole("button", { name: "Next", exact: true });
  const go = async (path) => { await next().click(); await p.waitForURL(`**/golf-trips/new/${path}`); };
  await p.goto(`${app}/golf-trips/new`);
  await p.getByLabel("Trip Name").fill("Maroon Masters 2027");
  await p.getByLabel("Destination").fill("Pinehurst, North Carolina");
  await p.getByLabel("Start Date").fill("2027-04-22");
  await p.getByLabel("End Date").fill("2027-04-26");
  await go("players");
  await p.getByLabel("Number of Players").fill("8");
  await p.getByLabel("Your Name").fill("Cade");
  await p.getByLabel("Your Email").fill("cade@example.com");
  await go("golf");
  for (let i = 0; i < 2; i++) await p.getByRole("button", { name: "One more golf day" }).click();
  await p.getByRole("radio", { name: "2 rounds" }).first().check({ force: true });
  await go("courses");
  await p.getByLabel("Round 1 course").fill("Pinehurst No. 2");
  await go("format"); await p.getByText("Yes", { exact: true }).click();
  await go("lodging"); await p.getByText("No", { exact: true }).click();
  await go("flights"); await p.getByText("Not sure yet", { exact: true }).click();
  await go("transportation"); await p.getByText("Yes", { exact: true }).click();
  await go("review");
}

let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const create = (p) => p.getByRole("button", { name: /Create Golf Trip|Creating your trip/ });

  // Signed out: Create explains how to continue and keeps every answer.
  const out = await phone(null);
  await fillQuestionnaire(out);
  await create(out).click();
  await out.locator("main [role=alert]").waitFor();
  assert.match(await out.locator("main [role=alert]").innerText(), /Log in to create your trip/);
  assert.equal(await out.getByRole("link", { name: "Log in" }).getAttribute("href"), "/login");
  assert.match(await out.locator("main").innerText(), /Maroon Masters 2027/);
  assert.equal(await count("golf_trips"), 0);

  // Save fails (database down for a moment): useful error, answers kept, retry works.
  const p = await phone(cade);
  await fillQuestionnaire(p);
  await fake.db.query("alter function public.create_golf_trip(uuid, jsonb) rename to create_golf_trip_off");
  await create(p).click();
  await p.locator("main [role=alert]").waitFor();
  assert.match(await p.locator("main [role=alert]").innerText(), /isn't switched on yet/);
  assert.match(await p.locator("main").innerText(), /Pinehurst No\. 2/);
  assert.equal(await create(p).isEnabled(), true);
  await fake.db.query("alter function public.create_golf_trip_off(uuid, jsonb) rename to create_golf_trip");

  // Slow save: one tap shows the loading state, a second tap does nothing, exactly one trip is made.
  let requests = 0;
  await p.route("**/api/golf-trips", async (route) => { requests++; await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await create(p).click();
  assert.equal(await create(p).innerText(), "Creating your trip…");
  assert.equal(await create(p).isDisabled(), true);
  await create(p).click({ force: true });
  await p.waitForURL(/\/golf-trips\/[0-9a-f-]{36}$/, { timeout: 20000 });
  assert.equal(requests, 1, "the second tap never sent a request");
  assert.equal(await count("golf_trips"), 1);
  const tripUrl = p.url();

  // The real Golf Trip Home shows the saved trip.
  const home = await p.locator("main").innerText();
  for (const text of ["Maroon Masters 2027", "Pinehurst, North Carolina", "Pinehurst No. 2", "Cade"]) assert.ok(home.includes(text), `home shows ${text}`);
  assert.ok((await overflow(p)) <= 0, "no sideways scroll on Golf Trip Home");
  const saved = (await fake.db.query("select * from golf_trips")).rows[0];
  assert.equal(saved.created_by, cade.id);
  assert.deepEqual([saved.golf_days, saved.planned_rounds, saved.includes_tournament, saved.lodging_plan, saved.flight_plan, saved.transportation_plan],
    [2, 3, "yes", "no", "undecided", "yes"]);

  // Going Back to Review and tapping Create again opens the same trip, never a second one.
  await p.unroute("**/api/golf-trips");
  await p.goto(`${app}/golf-trips/new/review`);
  await create(p).click();
  await p.waitForURL(tripUrl, { timeout: 20000 });
  assert.equal(await count("golf_trips"), 1);

  // Refresh rebuilds the page from Supabase, even with the questionnaire answers gone.
  const homeText = async (page) => page.locator("main").innerText();
  await p.evaluate(() => sessionStorage.clear());
  await p.reload();
  for (const text of ["Maroon Masters 2027", "Pinehurst No. 2", "Cade"]) assert.ok((await homeText(p)).includes(text), `after refresh: ${text}`);

  // Navigating away and coming back later, in a brand-new session, opens the same page.
  const later = await phone(cade);
  await later.goto(`${app}/golf-trips`);
  await later.goto(tripUrl);
  for (const text of ["Maroon Masters 2027", "Pinehurst, North Carolina"]) assert.ok((await homeText(later)).includes(text), `reopened: ${text}`);

  // My Trips data: the creator's trip list has this trip, as organizer; a stranger's list is empty.
  const listed = (await fake.db.query("select list_my_golf_trips($1) r", [cade.id])).rows[0].r;
  assert.deepEqual(listed.map((t) => [t.id, t.name, t.role]), [[tripUrl.split("/").pop(), "Maroon Masters 2027", "organizer"]]);
  assert.deepEqual((await fake.db.query("select list_my_golf_trips($1) r", [stranger.id])).rows[0].r, []);

  // Only members can open it.
  const s = await phone(stranger);
  assert.equal((await s.goto(tripUrl)).status(), 404);
  const anon = await phone(null);
  await anon.goto(tripUrl);
  assert.match(new URL(anon.url()).pathname, /^\/login/);
  const api = await fetch(`${app}/api/golf-trips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(api.status, 401);

  assert.deepEqual(fake.unsupported, []);
  console.log("golf trip create browser check: PASS");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  await browser.close();
  // On Windows the server runs under a shell; kill the whole tree or `next start` keeps the port.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
