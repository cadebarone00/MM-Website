// End-to-end browser test: CREATE → COMPLETE (save/reload) → PUBLISH, signed in,
// against a real production build of the app pointed at scripts/fake-supabase.mjs
// (all real migrations in an in-memory Postgres). Never touches a real database.
//
// Run from a directory with a finished `next build`:
//   node scripts/test-tournament-dashboard-browser.mjs
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3105);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54399);
const app = `http://localhost:${APP_PORT}`;
const year = new Date().getFullYear();

const fake = await startFakeSupabase({ port: FAKE_PORT });
const organizer = await fake.addUser({ name: "organizer", approved: true });
const stranger = await fake.addUser({ name: "stranger" });

async function protectedSnapshot() {
  const tables = (await fake.db.query(`select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    and (table_name like 'live\\_%' or table_name like 'career\\_%' or table_name like 'broadcast\\_%' or table_name like '%odds%') order by 1`)).rows.map((r) => r.t);
  const snapshot = {};
  for (const table of tables) snapshot[table] = (await fake.db.query(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]') v from public."${table}" x`)).rows[0].v;
  snapshot.__maroon = (await fake.db.query(`select jsonb_build_object('t', (select to_jsonb(t) from tournaments t where is_legacy),
    'editions', (select jsonb_agg(to_jsonb(e) order by season_year) from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy)) v`)).rows[0].v;
  return snapshot;
}
const before = await protectedSnapshot();

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
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
    try { if ((await fetch(`${app}/tournaments/new`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Signed out: create refused; no dashboard for anyone.
  assert.equal((await fetch(`${app}/api/platform/tournaments`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status, 401);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...fake.sessionCookie(organizer), url: app }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // CREATE → EXIST: quick create with only a name.
  await page.goto(`${app}/tournaments/new`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const f = document.querySelector("main form"); return f && Object.keys(f).some((k) => k.startsWith("__reactProps")); });
  await page.getByLabel("Tournament name", { exact: true }).fill("Texas Cup");
  await page.getByRole("button", { name: "Create now, finish later", exact: true }).click();
  await page.waitForURL(`**/tournaments/texas-cup/${year}`, { timeout: 30000 });
  const stage = () => page.locator("[data-stage]").innerText();
  const percent = async () => Number((await page.getByTestId("setup-percent").innerText()).match(/(\d+)%/)[1]);
  assert.equal(await stage(), "Created");
  let last = await percent();

  const openAndSave = async (editLabel, fill, savedText) => {
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    await fill();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: savedText }).waitFor({ timeout: 15000 });
    const now = await percent();
    assert.ok(now > last, `${savedText} ${last}% -> ${now}%`);
    last = now;
  };

  await openAndSave("Edit basics", async () => {
    await page.getByLabel("Start date", { exact: true }).fill(`${year}-10-15`);
    await page.getByLabel("End date", { exact: true }).fill(`${year}-10-17`);
    await page.getByLabel("Destination", { exact: true }).fill("Horseshoe Bay, TX");
  }, "Basics saved.");
  await openAndSave("Edit teams", async () => {
    await page.getByRole("combobox", { name: /^Competition/ }).selectOption("teams");
    await page.getByLabel("Team 1 name", { exact: true }).fill("Blue");
    await page.getByLabel("Team 2 name", { exact: true }).fill("Gold");
  }, "Teams saved.");
  await openAndSave("Edit rules", async () => {}, "Rules saved.");
  await openAndSave("Edit rounds", async () => {
    for (const [i, format] of ["Fourball", "Foursome", "Singles"].entries()) await page.getByRole("combobox", { name: new RegExp(`^Round ${i + 1} format`) }).selectOption(format);
  }, "Rounds saved.");
  assert.equal(await stage(), "Ready to Publish");

  // Reload: everything is still there.
  const beforeReload = await percent();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await stage(), "Ready to Publish");
  assert.equal(await percent(), beforeReload);
  await page.getByRole("button", { name: "Edit basics", exact: true }).click();
  assert.equal(await page.getByLabel("Start date", { exact: true }).inputValue(), `${year}-10-15`);
  assert.equal(await page.getByLabel("Destination", { exact: true }).inputValue(), "Horseshoe Bay, TX");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await openAndSave("Edit players", async () => {
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "+ Add a player", exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByLabel(`Player ${i + 1} name`, { exact: true }).fill(`Golfer ${i + 1}`);
      await page.getByRole("combobox", { name: /^Team/ }).nth(i).selectOption({ label: i < 2 ? "Blue" : "Gold" });
    }
  }, "Players saved.");

  // Optional media: linked media saves and never changes publish readiness.
  await page.getByRole("button", { name: "Edit media", exact: true }).click();
  await page.getByLabel(/Linked media/).check();
  await page.getByRole("button", { name: "+ Add a link", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Highlights");
  await page.getByLabel("Link (https://)", { exact: true }).fill("https://youtube.com/@texascup");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Media saved." }).waitFor();
  assert.equal(await stage(), "Ready to Publish");

  // PUBLISH is its own action.
  await page.getByRole("button", { name: "Open publishing", exact: true }).click();
  await page.getByRole("button", { name: "Publish tournament", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Published." }).waitFor();
  assert.equal(await stage(), "Published");
  assert.deepEqual(pageErrors, []);
  if (process.env.SCREENSHOT_DIR) {
    await page.getByRole("button", { name: "Edit players", exact: true }).click();
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/dashboard.png`, fullPage: true });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }

  // A stranger can't see or change it, by page or by API.
  const other = await browser.newContext();
  await other.addCookies([{ ...fake.sessionCookie(stranger), url: app }]);
  const otherPage = await other.newPage();
  assert.equal((await otherPage.goto(`${app}/tournaments/texas-cup/${year}`)).status(), 404);
  const patch = await otherPage.request.patch(`${app}/api/platform/tournaments/texas-cup/${year}/sections/branding`, { data: { primary: "#000000", secondary: "#ffffff", accent: "#cccccc" } });
  assert.equal(patch.status(), 404);
  const read = await otherPage.request.get(`${app}/api/platform/tournaments/texas-cup/${year}`);
  assert.equal(read.status(), 404);

  // Saved in the database, planned only — not one live-scoring or Maroon row changed.
  const saved = (await fake.db.query(`select t.slug, e.season_year, e.published_at is not null published, (select count(*)::int from edition_rounds r where r.edition_id = e.id) rounds,
    (select count(*)::int from edition_roster r where r.edition_id = e.id) players from tournaments t join tournament_editions e on e.tournament_id = t.id where t.slug = 'texas-cup'`)).rows;
  assert.deepEqual(saved, [{ slug: "texas-cup", season_year: year, published: true, rounds: 3, players: 4 }]);
  assert.deepEqual(await protectedSnapshot(), before, "live-scoring and Maroon rows must be unchanged");

  console.log("Passed: signed-in quick create, 6 sections saved independently, percent rose each save, reload kept everything, optional media didn't block, publish is separate, stranger 404 by page and API, no live/Maroon rows touched.");
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
