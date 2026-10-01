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
  assert.match(await p.getByRole("list", { name: "Teams" }).innerText(), /Team White/i);
  assert.match(await p.locator("main").innerText(), /No active tournaments/i);
  await p.getByRole("button", { name: "Completed" }).click();
  assert.match(await p.locator("main").innerText(), /The Maroon Tournament 2024/i);
  await p.getByRole("button", { name: "Stats" }).click();
  assert.match(await p.locator("main").innerText(), /Scoring Average/i);
  await p.getByRole("button", { name: "About" }).click();
  assert.ok((await p.locator("main").innerText()).trim().length > 0);
  assert.equal(await p.locator('[data-site-bottom-nav] a[aria-current="page"]').innerText().then((t) => t.trim().toLowerCase()), "profile");
  assert.ok((await overflow(p)) <= 0, "player: no sideways scroll at 390px");

  // Fan, at 360px, with the active-tournaments SQL missing (not yet run in production).
  await fake.db.query("drop function public.list_my_active_editions(uuid)");
  const f = await phone(fan, 360);
  await f.goto(`${app}/profile`);
  await f.getByRole("heading", { level: 2 }).waitFor();
  assert.equal((await f.getByRole("heading", { level: 2 }).innerText()).trim(), LONG_NAME);
  assert.equal(await f.getByRole("link", { name: "Edit my bio" }).count(), 0, "fans get no pencil");
  assert.match(await f.locator("main").innerText(), /No active tournaments/i);
  assert.equal(await f.getByRole("link", { name: /Join a Tournament/i }).getAttribute("href"), "/tournaments/join");
  await f.getByRole("button", { name: "Completed" }).click();
  assert.match(await f.locator("main").innerText(), /No completed tournaments yet/i);
  await f.getByRole("button", { name: "Stats" }).click();
  assert.match(await f.locator("main").innerText(), /No stats yet\./);
  await f.getByRole("button", { name: "About" }).click();
  assert.match(await f.locator("main").innerText(), /No bio yet\./);
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
