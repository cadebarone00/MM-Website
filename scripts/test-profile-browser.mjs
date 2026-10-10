// End-to-end browser check for /profile against a production build pointed at
// scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-profile-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3107);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54401);
const app = `http://localhost:${APP_PORT}`;

const fake = await startFakeSupabase({ port: FAKE_PORT });
const fan = await fake.addUser({ name: "fan" });
// A long name with no spaces is the worst case for sideways scrolling at 360px.
const LONG_NAME = "fan" + "x".repeat(45);
await fake.db.query("update profiles set display_name = $2 where id = $1", [fan.id, LONG_NAME]);
const player = await fake.addUser({ name: "cadeuser" });
await fake.db.query("update profiles set player_slug = 'cade-barone' where id = $1", [player.id]);
// Profile read model: one golf trip the player organizes, one they were only invited to (pending: not history).
const trip = (await fake.db.query(`insert into golf_trips (name, destination, start_date, end_date, created_by, client_request_id)
  values ('Pinehurst Weekend', 'Pinehurst, NC', '2026-04-22', '2026-04-26', $1, gen_random_uuid()) returning id`, [player.id])).rows[0].id;
await fake.db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Cade', 'organizer', 'accepted')", [trip, player.id]);
const invitedTrip = (await fake.db.query(`insert into golf_trips (name, destination, start_date, end_date, created_by, client_request_id)
  values ('Bandon Invite', 'Bandon, OR', '2027-09-10', '2027-09-14', $1, gen_random_uuid()) returning id`, [fan.id])).rows[0].id;
await fake.db.query("insert into golf_trip_members (golf_trip_id, display_name, email, role, invitation_status) values ($1, 'Cade', 'cadeuser@example.test', 'member', 'pending')", [invitedTrip]);

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
let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Signed out → Log In.
  const out = await phone(null);
  await out.goto(`${app}/profile`);
  assert.match(new URL(out.url()).pathname, /^\/login/);

  // Logging in lands on your profile, never The Maroon Tournament's pages. The fake has no password
  // login, so the login API reply is stubbed; the session cookie stands in for the one it would set.
  const login = await phone(player);
  await login.route("**/api/auth/login", (route) => route.fulfill({ json: { ok: true } }));
  await login.goto(`${app}/login`);
  await login.locator("#login-identity").fill("cadeuser@example.test");
  await login.locator("#login-password").fill("not-checked");
  await login.locator('button[type="submit"]').click();
  await login.waitForURL(`${app}/profile`, { timeout: 15000 });

  // Player.
  const p = await phone(player);
  await p.goto(`${app}/profile`);
  await p.getByRole("heading", { level: 2 }).waitFor();
  assert.equal(await p.getByRole("heading", { level: 1 }).innerText(), "Profile");
  assert.match(await p.getByRole("heading", { level: 2 }).innerText(), /Cade Barone/);
  assert.match(await p.locator("body").innerText(), /Member since/i);
  assert.equal(await p.getByRole("link", { name: "Edit my bio" }).getAttribute("href"), "/portal/profile");
  assert.equal(await p.getByRole("link", { name: "Settings" }).getAttribute("href"), "/settings");
  // Overview: tournament years with that year's team (legacy Maroon archive) and the trip they actually joined.
  const tournaments = await p.getByRole("region", { name: "Tournaments" }).innerText();
  assert.match(tournaments, /2024 · The Maroon Tournament\s+Team White/i);
  const trips = await p.getByRole("region", { name: "Golf trips" }).innerText();
  assert.match(trips, /Pinehurst Weekend/);
  assert.doesNotMatch(trips, /Bandon Invite/, "a pending invitation is not trip history");
  assert.equal(await p.getByRole("link", { name: /Pinehurst Weekend/ }).getAttribute("href"), `/golf-trips/${trip}`);
  await p.getByRole("button", { name: "Rounds" }).click();
  await p.getByRole("region", { name: "Golf rounds" }).waitFor();
  await p.getByRole("button", { name: "Stats" }).click();
  assert.ok((await p.locator("main").innerText()).trim().length > 0);
  const html = await p.content();
  for (const secret of [player.id, "cadeuser@example.test"]) assert.equal(html.includes(secret), false, `page leaks ${secret}`);
  assert.equal(await p.locator('[data-site-bottom-nav] a[aria-current="page"]').innerText().then((t) => t.trim().toLowerCase()), "profile");
  assert.ok((await overflow(p)) <= 0, "player: no sideways scroll at 390px");

  // Fan, at 360px.
  const f = await phone(fan, 360);
  await f.goto(`${app}/profile`);
  await f.getByRole("heading", { level: 2 }).waitFor();
  assert.equal((await f.getByRole("heading", { level: 2 }).innerText()).trim(), LONG_NAME);
  assert.equal(await f.getByRole("link", { name: "Edit my bio" }).count(), 0, "fans get no pencil");
  // A brand-new golfer: no slug, no rounds, no tournaments — calm "will show here" lines, not errors.
  const main = await f.locator("main").innerText();
  assert.match(main, /No bio yet\./);
  assert.match(main, /Tournaments you play in will show here\./);
  assert.match(main, /Golf trips you join will show here\./);
  assert.doesNotMatch(main, /can.t be loaded/i);
  await f.getByRole("button", { name: "Rounds" }).click();
  assert.match(await f.locator("main").innerText(), /Rounds you finish will show here\./);
  await f.getByRole("button", { name: "Stats" }).click();
  assert.match(await f.locator("main").innerText(), /No player bio yet\./);
  assert.ok((await overflow(f)) <= 0, "fan: no sideways scroll at 360px");

  console.log("profile browser check: PASS");
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
