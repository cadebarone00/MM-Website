import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const port = Number(process.env.RETIREMENT_TEST_PORT || 3197);
const origin = "http://localhost:" + port;
const fake = await startFakeSupabase({ port: port + 20000 });
const user = await fake.addUser({ name: "retirementtester" });
await fake.db.query("update profiles set display_name='Retirement Tester', username='retirement-tester' where id=$1", [user.id]);
const originalTsconfig = readFileSync("tsconfig.json", "utf8");
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)], {
  env: { ...process.env, NEXT_BUILD_OUTPUT: ".next-v1-retirement", SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service", NEXT_PUBLIC_SUPABASE_URL: fake.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon", NEXT_TELEMETRY_DISABLED: "1" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", d => { log = (log + d).slice(-16000); });
server.stderr.on("data", d => { log = (log + d).slice(-16000); });
let browser;
let currentPage;
mkdirSync("test-results/v1-retirement", { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (/Ready in/.test(log)) { ready = true; break; }
    if (server.exitCode !== null) throw new Error("Test server exited: " + log);
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, "isolated Next server ready");
  browser = await chromium.launch({ headless: true });
  const anonymous = await browser.newContext();
  anonymous.setDefaultTimeout(120000);
  const page = await anonymous.newPage();
  const websiteLegacyRequests = [];
  page.on("request", request => { if (request.url().includes("/api/season-catalog")) websiteLegacyRequests.push(request.url()); });
  page.setDefaultNavigationTimeout(180000);
  for (const route of ["/tap-in", "/broadcast"]) {
    const response = await anonymous.request.get(origin + route, { maxRedirects: 0, timeout: 180000 });
    assert.equal(response.status(), 307);
    assert.equal(new URL(response.headers().location, origin).pathname, "/login/email");
    assert.equal(new URL(response.headers().location, origin).searchParams.get("next"), "/tap-in");
  }
  assert.equal((await anonymous.request.get(origin + "/api/tap-in/display")).status(), 401);
  console.log("PASS real signed-out page and display API gates");
  for (const [old, next] of [["/leaderboard/2026-palm-springs/players/cade-barone", "/golf-trips"], ["/teams/2026-palm-springs", "/golf-trips"], ["/history", "/golf-trips"], ["/portal/admin/broadcast-controls", "/golf-trips"], ["/portal/profile", "/profile"], ["/wagers/portfolio", "/pickems"], ["/fantasy", "/pickems"], ["/the-maroon/news", "/"], ["/watch-live", "/tap-in"], ["/dev-v1", "/dev"]]) {
    const response = await anonymous.request.get(origin + old, { maxRedirects: 0, timeout: 180000 });
    assert.equal(response.status(), 307, old);
    assert.equal(new URL(response.headers().location, origin).pathname, next, old);
  }
  console.log("PASS old nested URLs redirect to current destinations");
  for (const width of [1440, 393]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/website", { waitUntil: "networkidle" });
    assert.equal(await page.locator('header a[href="/tap-in"]').count(), 1);
    assert.equal(await page.locator('footer a[href="#"]').count(), 0);
    assert.equal(await page.locator('footer a[href="/tap-in"]').count(), 1);
    assert.equal(await page.getByText("Defending Champions:", { exact: false }).count(), 0);
    assert.equal(await page.locator('[data-site-bottom-nav]').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/v1-retirement/marketing-footer-" + width + ".png" });
  }
  assert.equal(websiteLegacyRequests.length, 0, "marketing does not mount legacy season polling");
  console.log("PASS responsive marketing footer and no V1 navigation/polling");
  await page.goto(origin + "/login/email?next=%2Ftap-in");
  assert.equal(await page.getByRole("link", { name: "Forgot your password?" }).getAttribute("href"), "/forgot-password?next=%2Ftap-in");
  const signed = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  signed.setDefaultTimeout(120000);
  await signed.addCookies([{ ...fake.sessionCookie(user), url: origin }]);
  const tv = await signed.newPage(); currentPage = tv; tv.setDefaultNavigationTimeout(180000);
  tv.on("pageerror", error => console.error("Browser error:", error.message));
  const tvLegacyRequests = [];
  tv.on("request", request => { if (request.url().includes("/api/season-catalog")) tvLegacyRequests.push(request.url()); });
  await tv.goto(origin + "/tap-in");
  await tv.getByRole("heading", { level: 1 }).waitFor();
  const hydrated = tv.waitForResponse(r => r.url().endsWith("/api/tap-in/display") && r.status() === 200, { timeout: 180000 });
  await tv.getByRole("link", { name: "Watch Live", exact: true }).click();
  await hydrated;
  await tv.getByRole("button", { name: "Fullscreen", exact: true }).waitFor();
  const response = await signed.request.get(origin + "/api/tap-in/display");
  assert.equal(response.status(), 200);
  assert.match(response.headers()["cache-control"], /private, no-store/);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.leaderboard.standings));
  assert.equal(await tv.locator("audio, video, iframe").count(), 0);
  await tv.waitForLoadState("networkidle");
  await tv.getByRole("button", { name: "Match Play", exact: true }).click();
  await tv.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Match Play" && button.getAttribute("aria-pressed") === "true"));
  await tv.getByRole("button", { name: "Pause scrolling", exact: true }).click();
  await tv.getByRole("button", { name: "Resume scrolling", exact: true }).waitFor();
  await tv.screenshot({ path: "test-results/v1-retirement/tv-display.png" });
  const longBoard = { ...payload, leaderboard: { ...payload.leaderboard, standings: Array.from({ length: 30 }, (_, i) => ({ player: "fixture-player-" + i, team: "maroon", toPar: i, todayToPar: i, thru: 18 })) } };
  await tv.route("**/api/tap-in/display", r => r.fulfill({ json: longBoard }));
  await tv.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await tv.getByRole("button", { name: "Resume scrolling", exact: true }).click();
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.waitForFunction(() => { const element = document.querySelector('[aria-label="TV leaderboard"]'); return element && element.scrollTop > 15; }, null, { timeout: 30000 });
  await tv.getByRole("button", { name: "Pause scrolling", exact: true }).click();
  const pausedAt = await tv.getByLabel("TV leaderboard").evaluate(element => element.scrollTop);
  await tv.waitForTimeout(600);
  assert.ok(Math.abs(await tv.getByLabel("TV leaderboard").evaluate(element => element.scrollTop) - pausedAt) < 2);
  await tv.screenshot({ path: "test-results/v1-retirement/tv-scrolling-fixture.png" });
  await tv.unroute("**/api/tap-in/display");
  console.log("PASS scrolling and pause with a long synthetic board");
  assert.equal(tvLegacyRequests.length, 0, "Tap In does not mount legacy season polling");
  await tv.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await tv.waitForFunction(() => document.fullscreenElement || document.body.textContent.includes("Use the browser fullscreen control"));
  if (await tv.evaluate(() => !!document.fullscreenElement)) await tv.getByRole("button", { name: "Fullscreen", exact: true }).click();
  console.log("PASS real signed-in display, no-store refresh and silent board/fullscreen controls");
  await tv.route("**/api/tap-in/display", r => r.fulfill({ status: 401, json: { error: "Sign in" } }));
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.getByRole("link", { name: "Sign In", exact: true }).waitFor();
  assert.equal(await tv.getByLabel("TV leaderboard").count(), 0);
  console.log("PASS session denial removes visible TV data");
  await tv.unroute("**/api/tap-in/display");
  assert.equal((await tv.goto(origin + "/profile")).status(), 200);
  await tv.getByRole("heading", { name: "Profile", exact: true }).waitFor();
  assert.equal((await tv.goto(origin + "/golf-trips")).status(), 200);
  await tv.locator("main").waitFor();
  console.log("PASS V2 profile and trip entry still render");
  const guide = await browser.newPage();
  await guide.goto(pathToFileURL(process.cwd() + "/docs/app-workflow.html").href);
  assert.match(await guide.getByRole("region", { name: "Recent workflow changes" }).innerText(), /V1 interface retirement/);
  await guide.getByRole("searchbox").fill("TapInDisplay");
  assert.ok(await guide.locator("details:not(.hidden)").count() > 0);
  await guide.getByRole("searchbox").fill("");
  await guide.locator('a[data-open]').filter({ hasText: "Tap In" }).first().click();
  assert.ok(await guide.locator("details[open]").count() > 0);
  await guide.screenshot({ path: "test-results/v1-retirement/workflow.png" });
  console.log("PASS workflow change panel, navigation and search");
} catch (error) {
  if (currentPage) await currentPage.screenshot({ path: "test-results/v1-retirement/failure.png" }).catch(() => {});
  console.error(log); throw error;
} finally {
  if (browser) await browser.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
  else server.kill("SIGTERM");
  await fake.close();
  const nextEnv = readFileSync("next-env.d.ts", "utf8");
  if (nextEnv.includes(".next-v1-retirement")) writeFileSync("next-env.d.ts", originalNextEnv);
  const config = readFileSync("tsconfig.json", "utf8");
  const cleaned = config.replace(/^.*"\.next-v1-retirement\/(?:dev\/)?types\/\*\*\/\*\.ts",?\r?\n/gm, "");
  const normalized = cleaned.replace(/,(\r?\n\s*\],?\r?\n\s*"exclude")/, "$1");
  if (config !== normalized) writeFileSync("tsconfig.json", JSON.stringify(JSON.parse(normalized)) === JSON.stringify(JSON.parse(originalTsconfig)) ? originalTsconfig : normalized);
}
