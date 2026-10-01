// End-to-end browser check for the main app navigation: Explore / Golf Trips / Profile / Tourneys / Pick'ems are
// the front door, tournaments are entered from Tourneys → My Tournaments, and login lands on Profile.
// Runs against a production build pointed at scripts/fake-supabase.mjs (real migrations in an
// in-memory Postgres). Run after `next build`:  node scripts/test-main-nav-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3112);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54412);
const app = `http://localhost:${APP_PORT}`;
const MAIN_TABS = ["/", "/golf-trips", "/profile", "/tournaments/join", "/pickems"];

const fake = await startFakeSupabase({ port: FAKE_PORT });
const fan = await fake.addUser({ name: "fan" });
const host = await fake.addUser({ name: "hostuser", isHost: true });
const player = await fake.addUser({ name: "cadeuser" });
// Cade claimed his player and is confirmed on the 2027 roster (same seeding as test-maroon-play-browser.mjs).
await fake.db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [player.id]);
await fake.db.query("update profiles set player_slug = 'cade-barone' where id = $1", [player.id]);
await fake.db.query("insert into live_roster (season_year, player_slug, team) values (2027, 'cade-barone', 'white')");
await fake.db.query("insert into live_roster_assignment_locks (season_year, player_slug) values (2027, 'cade-barone')");

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
const phone = async (user) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (user) await context.addCookies([{ ...fake.sessionCookie(user), url: app }]);
  return context.newPage();
};
const here = (page) => new URL(page.url()).pathname;
const main = (page) => page.locator("main").first().innerText();
let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const p = await phone(player);
  // The five main pages share the app chrome: icon-only top bar, the 5-tab bottom menu, the right tab lit.
  for (const [url, tab] of [["/", "explore"], ["/tournaments/join", "tourneys"], ["/tournaments/mine", "tourneys"], ["/pickems", "pick'ems"], ["/profile", "profile"]]) {
    await p.goto(app + url);
    await p.getByRole("heading", { level: 1 }).first().waitFor();
    assert.equal(here(p), url, `${url} is not redirected`);
    assert.doesNotMatch(await p.locator("header").first().innerText(), /The Maroon/, `${url}: no wordmark in the top bar`);
    const nav = await p.locator("[data-site-bottom-nav] a").evaluateAll((links) => links.map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]));
    assert.deepEqual(nav.map(([href]) => href), MAIN_TABS, `${url}: bottom menu`);
    assert.equal(await p.locator('[data-site-bottom-nav] a[aria-current="page"]').innerText().then((t) => t.trim().toLowerCase()), tab, `${url}: lit tab`);
  }

  // ☰ menu: My Tournaments is the player list; no direct /website tournament shortcut.
  await p.goto(app + "/");
  const menu = await p.locator('header nav[aria-label="Platform navigation"] a').evaluateAll((links) => links.map((a) => [a.textContent.trim(), a.getAttribute("href")]));
  assert.ok(!menu.some(([, href]) => href === "/website"), `menu has no /website link: ${JSON.stringify(menu)}`);
  assert.deepEqual(menu.filter(([label]) => label === "My Tournaments"), [["My Tournaments", "/tournaments/mine"]]);

  // Explore: no "My Tournaments · Coming soon" button (Explore's own article placeholders may say "Coming soon"); signed in, no "Log In" prompt; signed out, still offered.
  const explore = await main(p);
  assert.equal(await p.locator("main").getByText("My Tournaments", { exact: true }).count(), 0, "no My Tournaments button on Explore");
  assert.doesNotMatch(explore, /Already part of the club/i);
  const out = await phone(null);
  await out.goto(app + "/");
  assert.match(await main(out), /Already part of the club/i);
  assert.equal(await out.locator("main").getByText("My Tournaments", { exact: true }).count(), 0);
  // Explore's article links still work.
  for (const href of ["/schedule", "/history"]) {
    assert.ok(await out.locator(`main a[href="${href}"]`).count(), `Explore links to ${href}`);
    assert.equal((await out.request.get(app + href)).status(), 200, `${href} loads`);
  }

  // Login lands on Profile (the fake has no password login: the API reply is stubbed, the cookie is the session).
  const login = await phone(player);
  await login.route("**/api/auth/login", (route) => route.fulfill({ json: { ok: true } }));
  await login.goto(app + "/login");
  await login.locator("#login-identity").fill("cadeuser@example.test");
  await login.locator("#login-password").fill("not-checked");
  await login.locator('button[type="submit"]').click();
  await login.waitForURL(`${app}/profile`, { timeout: 15000 });

  // Tourneys → My Tournaments → Enter Tournament → /play.
  await p.goto(app + "/tournaments/join");
  await p.getByRole("link", { name: /My Tournaments/ }).first().click();
  await p.waitForURL(`${app}/tournaments/mine`);
  const back = p.locator('main a[href="/tournaments/join"]').first();
  assert.equal((await back.innerText()).trim(), "Tourneys", "My Tournaments back link says Tourneys");
  await p.getByRole("link", { name: /Enter Tournament/i }).first().click();
  await p.waitForURL(/\/play\/the-maroon-tournament\/2027/, { timeout: 15000 });

  // /account/choose is retired: signed in → Profile (player, host, fan); signed out → Log In.
  for (const user of [player, host, fan]) {
    const page = await phone(user);
    await page.goto(app + "/account/choose");
    await page.waitForURL(`${app}/profile`, { timeout: 15000 });
  }
  await out.goto(app + "/account/choose");
  assert.match(here(out), /^\/login/);

  // Legacy pages left in place: /website typed directly, and Edit Bio.
  await out.goto(app + "/website");
  assert.equal(here(out), "/website");
  assert.ok((await out.locator("body").innerText()).trim().length > 0);
  await p.goto(app + "/profile");
  assert.equal(await p.getByRole("link", { name: "Edit my bio" }).getAttribute("href"), "/portal/profile");
  await p.getByRole("link", { name: "Edit my bio" }).click();
  await p.waitForURL(`${app}/portal/profile`);
  await p.getByRole("heading", { name: "Edit My Bio" }).waitFor();

  console.log("main nav browser check: PASS");
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
