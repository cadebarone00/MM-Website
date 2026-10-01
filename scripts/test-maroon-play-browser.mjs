// End-to-end browser check for Maroon migration Phases 3–4: The Maroon Tournament
// in Tourneys (My Tournaments, Past Tournaments), Profile and its /play home
// (your match, More links, Admin Center link, history), against a production build
// pointed at scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-maroon-play-browser.mjs
import { spawn, spawnSync } from "node:child_process";
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
// Signed in, owns a player, but that player is on neither the 2026 nor the 2027 roster.
const outsider = await fake.addUser({ name: "peytonuser" });
await fake.db.query("update player_slots set claimed_by = $1 where player_slug = 'peyton-vos'", [outsider.id]);
// Added after C1 ran, so neither has a tournament_members row: access comes from the live flags.
const host = await fake.addUser({ name: "hostuser", isHost: true });
const admin = await fake.addUser({ name: "adminuser", platformRole: "admin" });
// Cade claimed his player and is on the 2027 Admin Center roster (locked = confirmed), all AFTER C1 ran:
// the one-time edition_roster copy doesn't have him, so the row must come from the live tables.
await fake.db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [player.id]);
await fake.db.query("update profiles set player_slug = 'cade-barone' where id = $1", [player.id]);
await fake.db.query("insert into live_roster (season_year, player_slug, team) values (2027, 'cade-barone', 'white')");
await fake.db.query("insert into live_roster_assignment_locks (season_year, player_slug) values (2027, 'cade-barone')");
await fake.db.query("delete from edition_roster");
// Admin Center posted two 2027 matchups for Cade (rounds 1 and 2, same day); round 1 is his next match.
await fake.db.query("insert into live_roster (season_year, player_slug, team) values (2027, 'cam-latto', 'maroon'), (2027, 'collin-ross', 'white'), (2027, 'drew-weisser', 'maroon')");
await fake.db.query("insert into live_round_state (season_year, round, date, format) values (2027, 1, '2027-01-06', 'Singles'), (2027, 2, '2027-01-06', 'Fourball')");
await fake.db.query(`insert into live_match_boxes (season_year, round, box_number, format, tee_time, maroon_players, white_players) values
  (2027, 1, 1, 'Singles', '2027-01-06T17:10:00Z', '{cam-latto}', '{cade-barone}'),
  (2027, 2, 1, 'Fourball', '2027-01-06T22:30:00Z', '{cam-latto,drew-weisser}', '{cade-barone,collin-ross}')`);

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

  // Enter Tournament: Tourneys → My Tournaments → card → Enter Tournament → its home.
  const p = await phone(player);
  await p.goto(`${app}/tournaments/join`);
  await p.getByRole("link", { name: /My Tournaments/ }).click();
  await p.waitForURL(`${app}/tournaments/mine`);
  const card = p.getByRole("link", { name: /^The Maroon Tournament 2027/ });
  await card.waitFor();
  assert.equal(await card.count(), 1, "one card: 2027 only (2034 test season and finished years never show)");
  assert.equal(await card.getAttribute("href"), `${HOME}/2027`, "the card itself still opens the tournament");
  const enter = p.getByRole("link", { name: /^Enter Tournament/ });
  assert.equal(await enter.count(), 1, "one Enter Tournament button per card");
  assert.equal(await enter.evaluate((el) => el.firstChild?.textContent?.trim()), "Enter Tournament", "visible label");
  assert.equal(await enter.locator("span").evaluate((el) => el.getBoundingClientRect().width <= 1), true, "the tournament name is for screen readers only");
  assert.match(await enter.textContent() ?? "", /The Maroon Tournament 2027/, "screen readers hear which tournament it enters");
  assert.ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, "no sideways scroll at 390px");
  await enter.click();
  await p.waitForURL(`${app}${HOME}/2027`);
  assert.match(await text(p), /Team Maroon/);
  await p.goto(`${app}${HOME}/2027/players`);
  assert.match(await text(p), /Cade Barone/, "the live roster shows on Players");
  // Your match: round 1 (the earliest), his opponent, and the tee time in the tournament's timezone, never UTC.
  await p.goto(`${app}${HOME}/2027`);
  const yours = p.locator("section", { has: p.getByRole("heading", { name: "Your Match" }) });
  const yoursText = await yours.innerText();
  assert.match(yoursText, /Round 1/);
  assert.match(yoursText, /Cam Latto/, "opponent");
  assert.match(yoursText, /Singles/);
  assert.match(yoursText, /\d{1,2}:10 [AP]M [A-Z]{2,4}/, "a real tee time with its timezone");
  assert.doesNotMatch(yoursText, /UTC|GMT/, "never the server clock");
  await p.goto(`${app}${HOME}/2027/matches`);
  assert.match(await text(p), /Fourball/, "both posted matchups show");

  // More (player, active year): live-feature and portal links, no Admin Center, history links to 2026.
  await p.goto(`${app}${HOME}/2027/more`);
  const features = p.getByRole("navigation", { name: "Tournament features" });
  const featureHrefs = await features.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  assert.deepEqual(featureHrefs, ["/portal/scoring", "/fantasy", "/wagers", "/watch-live", "/broadcast", "/portal/round-video", "/portal/skins", "/portal/career"]);
  assert.equal(await p.getByRole("link", { name: /Admin Center/ }).count(), 0, "players never see the Admin Center link");
  assert.equal(await p.getByRole("link", { name: /2026 season/ }).getAttribute("href"), `${HOME}/2026`);

  // More on a past year: only that year's own pages, never live-only ones.
  await p.goto(`${app}${HOME}/2026/more`);
  const pastHrefs = await p.getByRole("navigation", { name: "Tournament features" }).getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  assert.deepEqual(pastHrefs, ["/leaderboard/2026-palm-springs", "/leaderboard/2026-palm-springs/players/cade-barone", "/teams/2026-palm-springs", "/portal/career"]);

  // Every linked old page opens for the player.
  for (const href of [...new Set([...featureHrefs, ...pastHrefs])]) {
    const res = await (await phone(player)).goto(`${app}${href}`);
    assert.ok(res && res.status() < 400, `${href} → ${res?.status()}`);
  }

  // Tourneys → Past Tournaments → 2026 opens its /play home (not /website).
  await p.goto(`${app}/tournaments/join`);
  const pastRow = p.getByRole("link", { name: /^The Maroon Tournament 2026/ });
  assert.equal(await pastRow.getAttribute("href"), `${HOME}/2026`);
  await pastRow.click();
  await p.waitForURL(`${app}${HOME}/2026`);

  // Profile: Active 2027 and Completed 2026 both open /play.
  await p.goto(`${app}/profile`);
  await p.getByRole("heading", { level: 2 }).waitFor();
  const profileLinks = async () => p.locator("main a[href^='/play/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  assert.ok((await profileLinks()).includes(`${HOME}/2027`), "Profile Active → /play 2027");
  await p.getByRole("button", { name: "Completed" }).click();
  assert.ok((await profileLinks()).includes(`${HOME}/2026`), "Profile Completed → /play 2026");
  assert.equal(await p.locator("main a[href='/website']").count(), 0, "no Maroon row goes to /website");

  // Access: roster players, hosts and platform admins in; every other signed-in account gets not found.
  const status = async (who, path) => (await (await phone(who)).goto(`${app}${path}`))?.status();
  assert.equal(await status(player, `${HOME}/2026`), 200, "on the 2026 roster (history file)");
  for (const year of ["2026", "2027"]) {
    assert.equal(await status(fan, `${HOME}/${year}`), 404, `fan, ${year}`);
    assert.equal(await status(fan, `${HOME}/${year}/leaderboard`), 404, `fan, ${year} leaderboard tab`);
    assert.equal(await status(outsider, `${HOME}/${year}`), 404, `player not on the ${year} roster`);
    assert.equal(await status(host, `${HOME}/${year}`), 200, `Admin Center host, ${year}`);
    assert.equal(await status(admin, `${HOME}/${year}`), 200, `platform admin, ${year}`);
  }

  // Admin Center link: hosts only (Admin Center's own host check); a platform admin who isn't a host doesn't get it.
  const h = await phone(host);
  await h.goto(`${app}${HOME}/2027/more`);
  const adminLink = h.getByRole("link", { name: /Admin Center/ });
  assert.equal(await adminLink.getAttribute("href"), "/portal/admin");
  assert.equal(await h.getByRole("link", { name: "Live scoring" }).count(), 0, "a host with no player gets no portal links");
  assert.ok(((await (await phone(host)).goto(`${app}/portal/admin`))?.status() ?? 500) < 400, "the Admin Center opens for the host");
  const a = await phone(admin);
  await a.goto(`${app}${HOME}/2027/more`);
  assert.equal(await a.getByRole("link", { name: /Admin Center/ }).count(), 0, "platform admin without host access");

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

  // The old public Maroon pages still open for everyone, signed in or not.
  for (const path of ["/website", "/leaderboard/2026-palm-springs", "/leaderboard/2024-pinehurst", "/teams", "/schedule", "/history", "/players"]) {
    assert.equal(await status(null, path), 200, `old route ${path}`);
    assert.equal(await status(fan, path), 200, `old route ${path} (signed in)`);
  }

  console.log("Maroon /play browser check passed.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  await browser.close();
  // Wait for the server to stop, so a rerun never meets a stale build on the same port.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"]);
  else server.kill();
  await fake.close?.();
  process.exit(failed ? 1 : 0);
}
