// End-to-end browser test for the public tournament site /t/[tournament]/[year],
// against a real production build pointed at scripts/fake-supabase.mjs (all real
// migrations in an in-memory Postgres). Never touches a real database.
//
// Run from a directory with a finished `next build`:
//   node scripts/test-public-site-browser.mjs            (SCREENSHOT_DIR=... to save screenshots)
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3107);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54398);
const app = `http://localhost:${APP_PORT}`;
const fake = await startFakeSupabase({ port: FAKE_PORT });
const call = async (fn, args) => (await fake.db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows[0].r;

/** A tournament set up through the real platform functions (the same ones the dashboard uses). */
async function seed({ slug, name, visibility, publish = true, site, colors = ["#1f4e9c", "#d4a017"] }) {
  const owner = await fake.addUser({ name: `owner-${slug}`, approved: true });
  const { editionId } = await call("create_tournament_shell", [owner.id, { name, shortName: name, slug, seasonYear: 2027, startDate: null, endDate: null, timezone: "America/Chicago",
    visibility, branding: null, teams: [{ key: "team-1", name: "Blue", color: colors[0] }, { key: "team-2", name: "Gold", color: colors[1] }], scoring: { mode: "match_play" },
    plan: { competitionType: "teams", expectedPlayerCount: 4, rounds: [{ format: "Fourball" }, { format: "Singles" }] } }]);
  const save = (section, data) => call("save_tournament_section", [owner.id, editionId, section, data]);
  await save("basics", { name, shortName: name, description: `${name}: Blue vs Gold in the Hill Country.`, destination: "Horseshoe Bay, TX", startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility });
  await save("players", { players: ["Ann Lee", "Bo Diaz", "Cy Park", "Di Moss"].map((n, i) => ({ name: n, email: `p${i}@secret.example`, handicap: 5 + i, teamKey: i < 2 ? "team-1" : "team-2" })) });
  const setup = await save("courses", { courses: [{ name: "Horseshoe Bay Summit", city: "Horseshoe Bay", state: "TX", teeName: "Blue", par: 72, yards: 6800 }] });
  const course = setup.courses[0].id;
  await save("rounds", { rounds: [{ day: 1, label: "Morning", format: "Fourball", courseId: course }, { day: 3, label: null, format: "Singles", courseId: course }] });
  await save("schedule", { rounds: [{ number: 1, playDate: "2027-04-15", startType: "tee_times", startTime: "08:30" }, { number: 2, playDate: "2027-04-17", startType: "shotgun", startTime: "13:00" }] });
  await save("rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100 });
  await save("branding", { primary: colors[0], secondary: "#ffffff", accent: colors[1], logoUrl: null });
  await save("media", { mode: "device_external", links: [{ label: "Highlights", url: "https://youtube.com/@texascup" }] });
  if (site) await save("website", site);
  if (publish) await call("set_edition_published", [owner.id, editionId, true]);
  return { owner, editionId };
}

await seed({ slug: "texas-cup", name: "Texas Cup", visibility: "public" });
const privateCup = await seed({ slug: "private-cup", name: "Private Cup", visibility: "private", colors: ["#2e6b4f", "#c2571a"] });
await seed({ slug: "hidden-cup", name: "Hidden Cup", visibility: "public", publish: false });
await seed({ slug: "quiet-cup", name: "Quiet Cup", visibility: "unlisted", site: { players: false, courses: false, leaderboard: false } });

const server = spawn(process.platform === "win32" ? `npx.cmd next start -p ${APP_PORT}` : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/t/texas-cup/2027`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const status = async (path) => (await fetch(`${app}${path}`, { redirect: "manual" })).status;

  // Visibility and resolution, as an anonymous visitor.
  assert.equal(await status("/t/texas-cup/2027"), 200, "public + published");
  assert.equal(await status("/t/private-cup/2027"), 404, "private is hidden");
  assert.equal(await status("/t/hidden-cup/2027"), 404, "unpublished is hidden");
  assert.equal(await status("/t/no-such-cup/2027"), 404);
  assert.equal(await status("/t/texas-cup/2026"), 404, "wrong year resolves nothing");
  assert.equal(await status("/t/texas-cup/twenty"), 404, "malformed year");
  assert.equal(await status("/t/the-maroon-tournament/2027"), 404, "the founding tournament keeps its own site");
  assert.equal(await status("/t/texas-cup/2027/admin"), 404, "unknown section");
  assert.equal(await status("/t/quiet-cup/2027"), 200, "unlisted opens by direct link");
  for (const hidden of ["players", "courses", "leaderboard"]) assert.equal(await status(`/t/quiet-cup/2027/${hidden}`), 404, `disabled ${hidden}`);
  const latest = await fetch(`${app}/t/texas-cup`, { redirect: "manual" });
  assert.ok([307, 308].includes(latest.status) && latest.headers.get("location")?.endsWith("/t/texas-cup/2027"), "latest edition redirect");

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${app}/t/texas-cup/2027`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.title(), "Texas Cup 2027");
  const home = await page.locator("body").innerText();
  for (const text of ["Texas Cup 2027", "Blue", "Gold", "April 15–17, 2027", "Horseshoe Bay, TX", "Highlights"]) assert.ok(home.includes(text), `home shows ${text}`);
  for (const text of ["DEFENDING CHAMPIONS", "The Maroon", "Maroon", "p0@secret.example"]) assert.ok(!home.includes(text), `home must not show ${text}`);
  assert.equal(await page.locator(".ts-site").evaluate((el) => getComputedStyle(el).getPropertyValue("--ts-primary").trim()), "#1f4e9c");
  assert.equal(await page.locator('meta[name="robots"]').count() === 0 || (await page.locator('meta[name="robots"]').getAttribute("content"))?.includes("index"), true);

  // Navigation stays under /t/texas-cup/2027.
  for (const [label, path, heading] of [["Schedule", "schedule", "Schedule"], ["Teams", "teams", "Teams"], ["Players", "players", "Players"], ["Courses", "courses", "Courses"], ["Info", "information", "Tournament information"]]) {
    await page.getByRole("navigation", { name: "Tournament pages" }).getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL(`**/t/texas-cup/2027/${path}`);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), heading);
  }
  assert.ok((await page.locator("body").innerText()).includes("Gross"), "info page shows the rules");
  for (const path of ["leaderboard", "matches", "results"]) {
    await page.goto(`${app}/t/texas-cup/2027/${path}`);
    const text = await page.locator("main").innerText();
    assert.ok(text.includes("Scores, matches and results will appear here once live scoring opens for this tournament."), `${path} holding state`);
  }
  if (process.env.SCREENSHOT_DIR) {
    await page.goto(`${app}/t/texas-cup/2027`);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/public-home.png`, fullPage: true });
  }

  // Unlisted: reachable, never indexed; disabled sections gone from its nav.
  await page.goto(`${app}/t/quiet-cup/2027`);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
  const quietNav = await page.getByRole("navigation", { name: "Tournament pages" }).innerText();
  for (const hidden of ["Players", "Courses", "Leaderboard"]) assert.ok(!quietNav.includes(hidden), `${hidden} hidden from nav`);

  // Phone width: no sideways scrolling.
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true });
  const phonePage = await phone.newPage();
  for (const path of ["", "/schedule", "/players", "/courses", "/information"]) {
    await phonePage.goto(`${app}/t/texas-cup/2027${path}`);
    const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `no horizontal scroll on phone at ${path || "/"} (${overflow}px)`);
  }
  if (process.env.SCREENSHOT_DIR) { await phonePage.goto(`${app}/t/texas-cup/2027`); await phonePage.screenshot({ path: `${process.env.SCREENSHOT_DIR}/public-phone.png`, fullPage: true }); }

  // Private: the owner (a member) can see it; the page is never indexed.
  const member = await browser.newContext();
  await member.addCookies([{ ...fake.sessionCookie(privateCup.owner), url: app }]);
  const memberPage = await member.newPage();
  assert.equal((await memberPage.goto(`${app}/t/private-cup/2027`)).status(), 200);
  assert.equal(await memberPage.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
  assert.equal(await memberPage.locator(".ts-site").evaluate((el) => getComputedStyle(el).getPropertyValue("--ts-primary").trim()), "#2e6b4f", "its own branding");

  assert.deepEqual(pageErrors, []);
  console.log("Passed: public/private/unpublished/unlisted/invalid/legacy resolution, latest-edition redirect, Blue/Gold branding, no Maroon chrome or emails, nav under /t, holding states, disabled sections hidden + 404, noindex for unlisted/private, phone width, member access to private.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error("--- app server log (tail) ---\n" + serverLog.split("\n").slice(-40).join("\n"));
} finally {
  if (fake.unsupported.length) console.log("fake-supabase: unsupported calls seen:", [...new Set(fake.unsupported)].slice(0, 10));
  await browser.close();
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
