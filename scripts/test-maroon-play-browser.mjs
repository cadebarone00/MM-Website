// End-to-end browser check for Maroon migration Phase 3: The Maroon Tournament
// in Tourneys → My Tournaments and its /play home, against a production build
// pointed at scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-maroon-play-browser.mjs
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3108);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54402);
const app = `http://localhost:${APP_PORT}`;
const HOME = "/play/the-maroon-tournament";

const fake = await startFakeSupabase({ port: FAKE_PORT });
const fan = await fake.addUser({ name: "fan" });
const player = await fake.addUser({ name: "cadeuser" });
// Cade claimed his player and is on the 2027 Admin Center roster (locked = confirmed), all AFTER C1 ran:
// the one-time edition_roster copy doesn't have him, so the row must come from the live tables.
await fake.db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [player.id]);
await fake.db.query("insert into live_roster (season_year, player_slug, team) values (2027, 'cade-barone', 'white')");
await fake.db.query("insert into live_roster_assignment_locks (season_year, player_slug) values (2027, 'cade-barone')");
await fake.db.query("delete from edition_roster");

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
const text = (page) => page.locator("body").innerText();
let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Signed out → Log In.
  const out = await phone(null);
  await out.goto(`${app}${HOME}/2026`);
  assert.match(new URL(out.url()).pathname, /^\/login/);

  // Player: Tourneys → My Tournaments → The Maroon Tournament 2027 → its home.
  const p = await phone(player);
  await p.goto(`${app}/tournaments/mine`);
  const row = p.getByRole("link", { name: /The Maroon Tournament/ });
  await row.waitFor();
  assert.equal(await row.count(), 1, "one row: 2027 only (2034 test season and finished years never show)");
  assert.equal(await row.getAttribute("href"), `${HOME}/2027`);
  await row.click();
  await p.waitForURL(`${app}${HOME}/2027`);
  assert.match(await text(p), /Team Maroon/);
  await p.goto(`${app}${HOME}/2027/players`);
  assert.match(await text(p), /Cade Barone/, "the live roster shows on Players");
  await p.goto(`${app}${HOME}/2027/matches`);
  assert.match(await text(p), /Pairings have not been posted yet/i, "no fake matches before pairings");

  // A finished year shows its real results (2026: Maroon 17–16).
  await p.goto(`${app}${HOME}/2026/leaderboard`);
  const board = await text(p);
  assert.match(board, /Team Maroon[\s\S]*17/);
  assert.match(board, /Team White[\s\S]*16/);
  assert.match(board, /Nate Wojciechowski/);
  await p.goto(`${app}${HOME}/2026/matches`);
  assert.match(await text(p), /Maroon wins 1 UP/);
  assert.match(await text(p), /Halved/);

  // Test season and bad years are not found.
  for (const bad of ["2034", "2040", "abcd"]) {
    const res = await p.goto(`${app}${HOME}/${bad}`);
    assert.equal(res?.status(), 404, bad);
  }

  // A fan with no claimed player sees the empty state.
  const f = await phone(fan);
  await f.goto(`${app}/tournaments/mine`);
  assert.match(await text(f), /not in any upcoming tournaments/i);

  // The old site is untouched.
  const legacy = await phone(null);
  const res = await legacy.goto(`${app}/leaderboard/2026-palm-springs`);
  assert.equal(res?.status(), 200);

  console.log("Maroon /play browser check passed.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  await browser.close();
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"]);
  else server.kill();
  await fake.close?.();
  process.exit(failed ? 1 : 0);
}
