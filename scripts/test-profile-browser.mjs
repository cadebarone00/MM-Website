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
// A legacy Maroon player who never changed signup's placeholder name. The old Maroon name / bio are retired: the
// profile shows only what they set (here "Golfer"), plus their historical golf data.
await fake.db.query("update profiles set player_slug = 'cade-barone', display_name = 'Golfer' where id = $1", [player.id]);
// One logged legacy round, brought in by the legacy import tool (run by hand in real life): it's an ordinary profile round.
await fake.db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [player.id]);
const legacyCourse = (await fake.db.query("insert into live_courses (name, holes) values ('Old Course Maroon', '[]') returning id")).rows[0].id;
const legacyRound = (await fake.db.query(`insert into handicap_rounds (player_slug, course_id, tee_set_id, tee_set_name, rating, slope, date_played, total_score, differential)
  values ('cade-barone', $1, 'blue', 'Blue', 72, 113, '2026-05-02', 80, 8) returning id`, [legacyCourse])).rows[0].id;
for (let hole = 1; hole <= 18; hole++) {
  await fake.db.query("insert into handicap_round_holes (round_id, hole, par, yards, score, putts, fir, gir) values ($1, $2, 4, 400, $3, 2, '1', true)", [legacyRound, hole, hole <= 8 ? 5 : 4]);
}
const imported = (await fake.db.query("select import_legacy_rounds(false) as r")).rows[0].r;
if (imported.counts.imported !== 1) throw new Error(`legacy import fixture: ${JSON.stringify(imported)}`);
// Profile V1: a login whose profile row was never made (signup stopped half-way).
const halfway = await fake.addUser({ name: "halfway" });
await fake.db.query("delete from profiles where id = $1", [halfway.id]);
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
  await login.goto(`${app}/login/email`);
  await login.locator("#login-identity").fill("cadeuser@example.test");
  await login.locator("#login-password").fill("not-checked");
  await login.locator('button[type="submit"]').click();
  await login.waitForURL(`${app}/profile`, { timeout: 15000 });

  // Player.
  const p = await phone(player);
  await p.goto(`${app}/profile`);
  await p.getByRole("heading", { level: 2 }).waitFor();
  // The site top bar (with the "Profile" title) is hidden at phone width; it is still on the page.
  assert.deepEqual(await p.locator("h1").allTextContents(), ["Profile"]);
  assert.equal((await p.getByRole("heading", { level: 2 }).innerText()).trim(), "Golfer", "no legacy Maroon name fallback");
  assert.match(await p.locator("body").innerText(), /Member since/i);
  assert.equal(await p.getByRole("link", { name: "Edit profile" }).getAttribute("href"), "/profile/edit");
  assert.equal(await p.getByRole("link", { name: "Settings" }).getAttribute("href"), "/settings");
  // Overview: tournament years with that year's team (legacy Maroon archive) and the trip they actually joined.
  const tournaments = await p.getByRole("region", { name: "Tournaments" }).innerText();
  assert.match(tournaments, /2024 · The Maroon Tournament\s+Team White/i);
  const trips = await p.getByRole("region", { name: "Golf trips" }).innerText();
  assert.match(trips, /Pinehurst Weekend/);
  assert.doesNotMatch(trips, /Bandon Invite/, "a pending invitation is not trip history");
  assert.equal(await p.getByRole("link", { name: /Pinehurst Weekend/ }).getAttribute("href"), `/golf-trips/${trip}`);
  await p.getByRole("button", { name: "Rounds" }).click();
  const rounds = await p.getByRole("region", { name: "Golf rounds" }).innerText();
  assert.match(rounds, /Old Course Maroon[\s\S]*Logged round[\s\S]*Counts · differential 8/, "the imported legacy round is a normal profile round");
  await p.getByRole("button", { name: "Stats" }).click();
  // One stats engine over every canonical round: the imported round counts like any other.
  assert.match(await p.getByRole("region", { name: "Round stats" }).innerText(), /Rounds\s+1[\s\S]*Best 18\s+80/);
  assert.doesNotMatch(await p.locator("main").innerText(), /Edit Maroon player details/, "the old Player Portal editor isn't linked any more");
  const html = await p.content();
  for (const secret of [player.id, "cadeuser@example.test"]) assert.equal(html.includes(secret), false, `page leaks ${secret}`);
  assert.equal(await p.locator('[data-site-bottom-nav] a[aria-current="page"]').innerText().then((t) => t.trim().toLowerCase()), "profile");
  assert.ok((await overflow(p)) <= 0, "player: no sideways scroll at 390px");

  // Fan, at 360px.
  const f = await phone(fan, 360);
  await f.goto(`${app}/profile`);
  await f.getByRole("heading", { level: 2 }).waitFor();
  assert.equal((await f.getByRole("heading", { level: 2 }).innerText()).trim(), LONG_NAME);
  assert.equal(await f.getByRole("link", { name: "Edit profile" }).getAttribute("href"), "/profile/edit", "every golfer can edit their profile");
  // A brand-new golfer: no slug, no rounds, no tournaments — calm "will show here" lines, not errors.
  const main = await f.locator("main").innerText();
  assert.match(main, /No bio yet\. Add one\./);
  assert.match(main, /Tournaments you play in will show here\./);
  assert.match(main, /Golf trips you join will show here\./);
  assert.doesNotMatch(main, /can.t be loaded/i);
  await f.getByRole("button", { name: "Rounds" }).click();
  assert.match(await f.locator("main").innerText(), /Rounds you finish will show here\./);
  await f.getByRole("button", { name: "Stats" }).click();
  assert.match(await f.locator("main").innerText(), /Stats will show here once you finish rounds\./);
  assert.equal(await f.getByRole("region", { name: "The Maroon Tournament archive" }).count(), 0, "no legacy section for a normal golfer");
  assert.ok((await overflow(f)) <= 0, "fan: no sideways scroll at 360px");

  // Edit profile: name, username, bio. A username someone else has is refused.
  const edit = await phone(fan);
  await edit.goto(`${app}/profile/edit`);
  await edit.getByLabel("Username", { exact: true }).fill("cadeuser");
  await edit.getByRole("button", { name: "Save" }).click();
  await edit.getByRole("form", { name: "Edit profile" }).getByRole("alert").filter({ hasText: /taken/i }).waitFor();
  await edit.getByLabel("Name", { exact: true }).fill("Fan Person");
  await edit.getByLabel("Username", { exact: true }).fill("FanPerson");
  await edit.getByLabel("Bio", { exact: true }).fill("Weekend golfer from Austin.");
  await edit.getByRole("button", { name: "Save" }).click();
  await edit.waitForURL(`${app}/profile`);
  await edit.getByRole("heading", { name: "Fan Person" }).waitFor();
  assert.match(await edit.locator("main").innerText(), /Weekend golfer from Austin\./);
  assert.match(await edit.locator("header").last().innerText(), /@FanPerson/);

  // Someone else's profile by username. Private (the default): name only.
  const viewer = await phone(player);
  await viewer.goto(`${app}/profile/fanperson`);
  await viewer.getByText("This profile is private.").waitFor();
  assert.match(await viewer.getByRole("heading", { level: 2 }).innerText(), /Fan Person/);
  assert.doesNotMatch(await viewer.locator("body").innerText(), /Weekend golfer|Member since/);
  assert.equal(await viewer.getByRole("button", { name: "Rounds" }).count(), 0);
  assert.equal(await viewer.getByRole("link", { name: "Edit profile" }).count(), 0, "only the owner can edit");
  assert.equal(await viewer.getByRole("link", { name: "Settings" }).count(), 0);
  // The owner always sees their own (a private profile, by username, goes to /profile).
  await edit.goto(`${app}/profile/FanPerson`);
  await edit.waitForURL(`${app}/profile`);
  // Public: the bio and public history show — golf trips never do. No ids or emails anywhere on the page.
  await fake.db.query("update profiles set rounds_visibility = 'public' where id = $1", [fan.id]);
  await viewer.goto(`${app}/profile/fanperson`);
  await viewer.getByText("Weekend golfer from Austin.").waitFor();
  assert.equal(await viewer.getByRole("region", { name: "Golf trips" }).count(), 0, "trips are never shown to others");
  assert.match(await viewer.getByRole("region", { name: "Tournaments" }).innerText(), /No public tournaments yet\./);
  const visitor = await phone(null);
  await visitor.goto(`${app}/profile/fanperson`);
  await visitor.getByText("Weekend golfer from Austin.").waitFor();
  for (const page of [viewer, visitor]) {
    const pageHtml = await page.content();
    for (const secret of [fan.id, player.id, fan.email, player.email]) assert.equal(pageHtml.includes(secret), false, `public profile leaks ${secret}`);
  }
  assert.equal((await visitor.goto(`${app}/profile/nobody-here`))?.status(), 404);

  // A login with no profile row: Finish profile setup creates it, once.
  const setup = await phone(halfway);
  await setup.goto(`${app}/profile`);
  await setup.getByRole("form", { name: "Finish profile setup" }).waitFor();
  await setup.getByLabel("Name", { exact: true }).fill("Hal Fway");
  await setup.getByLabel("Username", { exact: true }).fill("halfway");
  await setup.getByRole("button", { name: "Create my profile" }).click();
  await setup.getByRole("heading", { name: "Hal Fway" }).waitFor();
  assert.equal((await fake.db.query("select count(*)::int n from profiles where id = $1", [halfway.id])).rows[0].n, 1);

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
