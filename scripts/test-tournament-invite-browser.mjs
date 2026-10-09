// End-to-end browser check for tournament player invitations: organizer makes an invite link for a saved player →
// signed-out preview → golfer accepts (their profile becomes that tournament player) → organizer sees Joined;
// decline kills the link; a used link can't be taken by someone else.
// Runs a production build against scripts/fake-supabase.mjs. Run after `next build`:  node scripts/test-tournament-invite-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3110);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54404);
const app = `http://localhost:${APP_PORT}`;
const api = "/api/platform/tournaments/texas-cup/2027";

const fake = await startFakeSupabase({ port: FAKE_PORT });
const organizer = await fake.addUser({ name: "organizer", approved: true });
const golfer = await fake.addUser({ name: "golfer" });
const other = await fake.addUser({ name: "other" });
const player = async (name) => (await fake.db.query("select id, profile_id from tournament_players where display_name = $1", [name])).rows[0];

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
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app });
  return context.newPage();
};
const call = (p, url, method, body) => p.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [url, method, body]);

/** Organizer: open Edit players and make (or renew) the invite link for `name`; returns the shown link. */
async function makeLink(p, name) {
  await p.goto(`${app}/tournaments/texas-cup/2027`);
  await p.getByRole("button", { name: "Edit players" }).click();
  const group = p.getByRole("group", { name: `Invitation for ${name}` });
  await group.getByRole("button", { name: /invite link/ }).click();
  return group.getByLabel(`Invite link for ${name}`).inputValue();
}
const badge = async (p, name) => {
  await p.goto(`${app}/tournaments/texas-cup/2027`);
  await p.getByRole("button", { name: "Edit players" }).click();
  const group = p.getByRole("group", { name: `Invitation for ${name}` });
  await group.getByText(/Joined|Invited|Declined|Not invited/).waitFor();
  return group.innerText();
};

let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Setup through the same API the screens use: a tournament with two saved players (no profiles yet).
  const org = await phone(organizer);
  await org.goto(`${app}/tournaments`);
  const created = await call(org, "/api/platform/tournaments", "POST", { name: "Texas Cup", slug: "texas-cup", seasonYear: 2027, startDate: "", endDate: "",
    timezone: "America/Chicago", visibility: "private", competitionType: "individual", expectedPlayerCount: 8, teamNames: ["", ""], roundCount: 1,
    scoringMode: "tbd", formats: [null], branding: null });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const saved = await call(org, `${api}/sections/players`, "PATCH", { expectedPlayerCount: "8", players: [
    { id: null, name: "Ann Lee", email: "ann@secret.example", handicap: "", teamKey: null }, { id: null, name: "Cy Park", email: "", handicap: "", teamKey: null }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal((await player("Ann Lee")).profile_id, null);

  // 1. Organizer: statuses + make Ann's link.
  assert.match(await badge(org, "Ann Lee"), /Not invited/);
  const annLink = await makeLink(org, "Ann Lee");
  assert.match(annLink, new RegExp(`^${app}/tournaments/invite/[A-Za-z0-9_-]{32,}$`));
  await org.getByRole("group", { name: "Invitation for Ann Lee" }).getByRole("button", { name: "Copy invite link" }).click();
  assert.equal(await org.evaluate(() => navigator.clipboard.readText()), annLink);
  assert.match(await badge(org, "Ann Lee"), /Invited/);

  // 2. Signed out: safe preview; login / signup return to the invite.
  const out = await phone(null);
  await out.goto(annLink);
  assert.match(await out.locator("main").innerText(), /Texas Cup[\s\S]*play as Ann Lee[\s\S]*Join this tournament/);
  assert.equal((await out.content()).includes("ann@secret.example"), false);
  const back = encodeURIComponent(new URL(annLink).pathname);
  assert.equal(await out.getByRole("link", { name: "Log in" }).getAttribute("href"), `/login/email?next=${back}`);
  assert.equal(await out.getByRole("link", { name: "Create an account" }).getAttribute("href"), `/signup?next=${back}`);

  // 3. The golfer accepts: their profile becomes that same tournament player, and they're a tournament member.
  const g = await phone(golfer);
  await g.goto(annLink);
  await g.getByRole("button", { name: "Accept" }).click();
  await g.waitForURL(`${app}/tournaments/mine`, { timeout: 20000 });
  assert.equal((await player("Ann Lee")).profile_id, golfer.id);
  assert.equal((await fake.db.query("select count(*)::int n from tournament_players where display_name = 'Ann Lee'")).rows[0].n, 1, "no new player row");
  assert.equal((await fake.db.query("select role from tournament_members where profile_id = $1", [golfer.id])).rows[0]?.role, "player");
  await g.goto(annLink);
  assert.match(await g.locator("main").innerText(), /You're already playing in this tournament/);
  assert.match(await badge(org, "Ann Lee"), /Joined/);
  assert.equal(await org.getByRole("group", { name: "Invitation for Ann Lee" }).getByRole("button").count(), 0, "joined players get no link button");

  // 4. Someone else can't take a used link; decline kills a link and shows as Declined.
  const o = await phone(other);
  await o.goto(annLink);
  assert.match(await o.locator("main").innerText(), /This invitation was already accepted/);
  const cyLink = await makeLink(org, "Cy Park");
  await o.goto(cyLink);
  await o.getByRole("button", { name: "Decline" }).click();
  await o.getByRole("alertdialog", { name: "Decline this invitation?" }).getByRole("button", { name: "Decline" }).click();
  await o.getByText("Invitation declined").waitFor();
  assert.equal((await player("Cy Park")).profile_id, null);
  await o.goto(cyLink);
  assert.match(await o.locator("main").innerText(), /This invite link isn't valid/);
  assert.match(await badge(org, "Cy Park"), /Declined/);

  // 5. Only organizers make links or see statuses.
  const cy = await player("Cy Park");
  assert.equal((await call(g, `${api}/players/${cy.id}/invite`, "POST")).status, 404);
  assert.equal((await call(g, `${api}/players/invites`, "GET")).status, 404);

  // 6. Recurring players: remove Cy from 2027, then bring him back with "Add existing player" — same player, no new row.
  const playerCount = async () => (await fake.db.query("select count(*)::int n from tournament_players where tournament_id = (select id from tournaments where slug = 'texas-cup')")).rows[0].n;
  const removeAndSave = async (p, name) => {
    await p.goto(`${app}/tournaments/texas-cup/2027`);
    await p.getByRole("button", { name: "Edit players" }).click();
    const rows = p.locator("form").locator("input[maxlength='80']");
    const count = await rows.count();
    for (let i = 0; i < count; i++) if ((await rows.nth(i).inputValue()) === name) { await p.getByRole("button", { name: `Remove player ${i + 1}` }).click(); break; }
    await p.getByRole("button", { name: "Save", exact: true }).click();
    await p.getByText("Players saved.").waitFor();
  };
  await removeAndSave(org, "Cy Park");
  assert.equal(await playerCount(), 2, "removing from the roster keeps the player");
  await org.goto(`${app}/tournaments/texas-cup/2027`);
  await org.getByRole("button", { name: "Edit players" }).click();
  await org.getByRole("button", { name: "+ Add existing player" }).click();
  const existing = org.getByRole("group", { name: "Existing players" });
  assert.match(await existing.innerText(), /Cy Park[\s\S]*Not joined yet/);
  assert.equal((await existing.innerText()).includes("last played"), false, "removed from every year: no season to show");
  assert.equal((await existing.innerText()).includes("Ann Lee"), false, "players already on this year aren't offered");
  await existing.getByRole("button", { name: "Add Cy Park" }).click();
  await org.getByRole("button", { name: "Save", exact: true }).click();
  await org.getByText("Players saved.").waitFor();
  assert.equal(await playerCount(), 2, "bringing a player back creates no new player");
  assert.equal((await fake.db.query("select count(*)::int n from edition_roster where tournament_player_id = $1", [cy.id])).rows[0].n, 1);

  // 7. Next year (2028): the joined golfer comes back as the same tournament player with a fresh roster row.
  const t = (await fake.db.query("select id from tournaments where slug = 'texas-cup'")).rows[0].id;
  const e2027 = (await fake.db.query("select id from tournament_editions where tournament_id = $1 and season_year = 2027", [t])).rows[0].id;
  const e2028 = (await fake.db.query("insert into tournament_editions (tournament_id, season_year, label) values ($1, 2028, 'Texas Cup 2028') returning id", [t])).rows[0].id;
  await fake.db.query("insert into edition_settings (edition_id, scoring, plan) select $1, scoring, plan from edition_settings where edition_id = $2", [e2028, e2027]);
  await org.goto(`${app}/tournaments/texas-cup/2028`);
  await org.getByRole("button", { name: "Edit players" }).click();
  await org.getByRole("button", { name: "+ Add existing player" }).click();
  const pool2028 = org.getByRole("group", { name: "Existing players" });
  assert.match(await pool2028.innerText(), /Ann Lee[\s\S]*Joined[\s\S]*Cy Park/);
  assert.equal((await org.content()).includes(golfer.id), false, "no profile ids reach the page");
  await pool2028.getByRole("button", { name: "Add Ann Lee" }).click();
  await org.getByRole("button", { name: "Save", exact: true }).click();
  await org.getByText("Players saved.").waitFor();
  assert.equal(await playerCount(), 2, "same golfer next year: still one tournament player");
  const annRows = (await fake.db.query("select e.season_year from edition_roster r join tournament_editions e on e.id = r.edition_id where r.tournament_player_id = (select id from tournament_players where profile_id = $1) order by 1", [golfer.id])).rows;
  assert.deepEqual(annRows.map((r) => r.season_year), [2027, 2028]);

  assert.deepEqual(fake.unsupported, []);
  console.log("tournament invite browser check: PASS");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  await browser.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
