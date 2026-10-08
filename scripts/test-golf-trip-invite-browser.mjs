// End-to-end browser check for Golf Trip invitations: organizer invites → link → signed-out preview → accept / decline
// → profile-backed member → new link / cancel / remove / leave, and that members never receive other members' emails.
// Runs a production build against scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-golf-trip-invite-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3109);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54403);
const app = `http://localhost:${APP_PORT}`;

const fake = await startFakeSupabase({ port: FAKE_PORT });
const cade = await fake.addUser({ name: "cade" });
const john = await fake.addUser({ name: "john" });
const mike = await fake.addUser({ name: "mike" });
const ORGANIZER_EMAIL = "organizer-cade@example.com";
const trip = (await fake.db.query("select create_golf_trip($1, $2) as r", [cade.id, JSON.stringify({
  requestId: randomUUID(), name: "Pinehurst Weekend", destination: "Pinehurst, NC", latitude: null, longitude: null, externalPlaceId: null,
  startDate: "2027-04-22", endDate: "2027-04-26", expectedTravelerCount: 8, golfDays: 1,
  rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2027-04-23", courseName: "Pinehurst No. 2" }],
  includesTournament: "no", lodgingPlan: "no", flightPlan: "no", transportationPlan: "no",
  organizer: { displayName: "Cade", email: ORGANIZER_EMAIL },
})])).rows[0].r.tripId;
const memberRow = async (name) => (await fake.db.query("select profile_id, invitation_status from golf_trip_members where golf_trip_id = $1 and display_name = $2", [trip, name])).rows[0];

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const phone = async (user) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (user) await context.addCookies([{ ...fake.sessionCookie(user), url: app }]);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app });
  return context.newPage();
};
const settings = `${app}/golf-trips/${trip}/settings`;
const membersCard = (p) => p.getByRole("region", { name: "Members" });

/** Organizer: Organizer tab → Invite member → returns the shown invite link. */
async function invite(p, name, email) {
  await p.goto(settings);
  await p.getByRole("tab", { name: "Organizer" }).click();
  const form = p.getByRole("form", { name: "Invite member" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email (optional)").fill(email);
  await form.getByRole("button", { name: "Create invite link" }).click();
  const box = p.getByRole("group", { name: `Invite link for ${name}` });
  await box.waitFor();
  return box.getByLabel("Invite link").inputValue();
}
const rowOf = (p, name) => membersCard(p).getByRole("listitem").filter({ hasText: name });
/** The link shown for `name`, once it differs from `old` (a new link replaces the shown one). */
async function shownLink(p, name, old) {
  const box = p.getByRole("group", { name: `Invite link for ${name}` }).getByLabel("Invite link");
  for (let i = 0; i < 50; i++) {
    if (await box.count()) { const value = await box.inputValue(); if (value && value !== old) return value; }
    await p.waitForTimeout(200);
  }
  throw new Error(`no new invite link shown for ${name}`);
}

let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 1. Organizer invites John (no account involved yet): a pending member row with no profile.
  const organizer = await phone(cade);
  const johnLink = await invite(organizer, "John Smith", "john.smith@example.com");
  assert.match(johnLink, new RegExp(`^${app}/golf-trips/invite/[A-Za-z0-9_-]{32,}$`));
  assert.deepEqual(await memberRow("John Smith"), { profile_id: null, invitation_status: "pending" });
  assert.match(await rowOf(organizer, "John Smith").innerText(), /Invited[\s\S]*john\.smith@example\.com/i, "organizer sees the invite email");
  await organizer.getByRole("group", { name: "Invite link for John Smith" }).getByRole("button", { name: "Copy invite link" }).click();
  assert.equal(await organizer.evaluate(() => navigator.clipboard.readText()), johnLink);
  assert.ok((await overflow(organizer)) <= 0, "no sideways scroll on Trip Settings");

  // 2. Signed out: safe preview, log in / sign up return here, invited email never on the page.
  const out = await phone(null);
  await out.goto(johnLink);
  const outText = await out.locator("main").innerText();
  assert.match(outText, /Pinehurst Weekend[\s\S]*Cade invited John Smith[\s\S]*Join this trip/);
  assert.equal((await out.content()).includes("john.smith@example.com"), false, "invited email is never sent to the link holder");
  const back = encodeURIComponent(new URL(johnLink).pathname);
  assert.equal(await out.getByRole("link", { name: "Log in" }).getAttribute("href"), `/login/email?next=${back}`);
  assert.equal(await out.getByRole("link", { name: "Create an account" }).getAttribute("href"), `/signup?next=${back}`);
  await out.goto(`${app}/signup?next=${back}`);
  assert.equal((await out.goto(`${app}/login/email?next=${back}`)).status(), 200);

  // 3. John (signed in, any email) accepts → his profile is attached to that same row → he lands in the trip.
  const johnPage = await phone(john);
  await johnPage.goto(johnLink);
  await johnPage.getByRole("button", { name: "Accept" }).click();
  await johnPage.waitForURL(`${app}/golf-trips/${trip}`, { timeout: 20000 });
  assert.deepEqual(await memberRow("John Smith"), { profile_id: john.id, invitation_status: "accepted" });
  assert.equal((await fake.db.query("select count(*)::int n from golf_trip_members where golf_trip_id = $1", [trip])).rows[0].n, 2, "no second row");
  await johnPage.goto(johnLink);
  assert.match(await johnPage.locator("main").innerText(), /You're already in this trip/);

  // 4. Privacy: a normal member never receives other members' emails (trip page and settings page payloads).
  for (const url of [`${app}/golf-trips/${trip}`, settings]) {
    await johnPage.goto(url);
    const html = await johnPage.content();
    assert.equal(html.includes(ORGANIZER_EMAIL), false, `organizer email not sent to a member (${url})`);
  }
  await johnPage.goto(settings);
  assert.equal(await johnPage.getByRole("tab", { name: "Organizer" }).count(), 0);
  assert.match(await membersCard(johnPage).innerText(), /Cade[\s\S]*Organizer[\s\S]*John Smith[\s\S]*Member[\s\S]*You/i);
  assert.equal(await membersCard(johnPage).getByRole("button").count(), 0, "members can't manage others");

  // 5. Someone else opening John's used link can't take it.
  const mikePage = await phone(mike);
  await mikePage.goto(johnLink);
  assert.match(await mikePage.locator("main").innerText(), /This invitation was already accepted/);
  assert.equal((await mikePage.content()).includes("john@example.test"), false);

  // 6. New link for a pending invite: old link dies at once, new one works; decline keeps the row, link dies.
  const peteLink = await invite(organizer, "Pete", "");
  await rowOf(organizer, "Pete").getByRole("button", { name: "New invite link" }).click();
  const peteNew = await shownLink(organizer, "Pete", peteLink);
  assert.notEqual(peteNew, peteLink);
  await mikePage.goto(peteLink);
  assert.match(await mikePage.locator("main").innerText(), /This invite link isn't valid/);
  await mikePage.goto(peteNew);
  await mikePage.getByRole("button", { name: "Decline" }).click();
  await mikePage.getByRole("alertdialog", { name: "Decline this invitation?" }).getByRole("button", { name: "Decline" }).click();
  await mikePage.getByText("Invitation declined").waitFor();
  assert.deepEqual(await memberRow("Pete"), { profile_id: null, invitation_status: "declined" });
  await mikePage.goto(peteNew);
  assert.match(await mikePage.locator("main").innerText(), /This invite link isn't valid/, "a declined link can't be accepted later");
  await organizer.goto(settings);
  await organizer.getByRole("tab", { name: "Organizer" }).click();
  assert.match(await rowOf(organizer, "Pete").innerText(), /Declined/i);
  // Re-invite the declined row with a fresh link; Mike accepts it this time.
  await rowOf(organizer, "Pete").getByRole("button", { name: "Invite again" }).click();
  const peteAgain = await shownLink(organizer, "Pete", null);
  await mikePage.goto(peteAgain);
  await mikePage.getByRole("button", { name: "Accept" }).click();
  await mikePage.waitForURL(`${app}/golf-trips/${trip}`, { timeout: 20000 });
  assert.equal((await memberRow("Pete")).profile_id, mike.id);

  // 7. Organizer can cancel a pending invite and remove a member, but not themselves; accepted rows get no new link.
  await invite(organizer, "Sam", "sam@example.com");
  await rowOf(organizer, "Sam").getByRole("button", { name: "Cancel invite" }).click();
  await organizer.getByRole("alertdialog", { name: "Cancel Sam's invitation?" }).getByRole("button", { name: "Cancel invite" }).click();
  await organizer.getByText("Sam's invitation was cancelled.").waitFor();
  assert.equal(await memberRow("Sam"), undefined);
  assert.equal(await rowOf(organizer, "Cade").getByRole("button").count(), 0, "organizer can't remove themselves");
  assert.equal(await rowOf(organizer, "John Smith").getByRole("button", { name: /link|Invite again/ }).count(), 0, "accepted members get no invite link");
  const johnMemberId = (await fake.db.query("select id from golf_trip_members where profile_id = $1", [john.id])).rows[0].id;
  assert.equal(await organizer.evaluate(async ([t, m]) => (await fetch(`/api/golf-trips/${t}/members/${m}/link`, { method: "POST" })).status, [trip, johnMemberId]), 404);
  assert.equal(await johnPage.evaluate(async ([t, m]) => (await fetch(`/api/golf-trips/${t}/members/${m}`, { method: "DELETE" })).status, [trip, johnMemberId]), 404, "a member can't remove anyone");
  assert.equal(await johnPage.evaluate(async (t) => (await fetch(`/api/golf-trips/${t}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Gate crasher" }) })).status, trip), 404, "a member can't invite");
  await rowOf(organizer, "John Smith").getByRole("button", { name: "Remove" }).click();
  await organizer.getByRole("alertdialog", { name: "Remove John Smith?" }).getByRole("button", { name: "Remove" }).click();
  await organizer.getByText("John Smith was removed from the trip.").waitFor();
  assert.equal((await johnPage.goto(`${app}/golf-trips/${trip}`)).status(), 404, "removed member loses access");

  // 8. A normal member leaves on their own; the organizer can't (no Leave card, and the API refuses).
  await mikePage.goto(settings);
  await mikePage.getByRole("region", { name: "Leave trip" }).getByRole("button", { name: "Leave Trip" }).click();
  await mikePage.getByRole("alertdialog", { name: "Leave this trip?" }).getByRole("button", { name: "Leave" }).click();
  await mikePage.waitForURL(`${app}/golf-trips`, { timeout: 20000 });
  assert.equal(await memberRow("Pete"), undefined);
  await organizer.goto(settings);
  assert.equal(await organizer.getByRole("region", { name: "Leave trip" }).count(), 0);
  assert.equal(await organizer.evaluate(async (t) => (await fetch(`/api/golf-trips/${t}/leave`, { method: "POST" })).status, trip), 404);
  assert.match(await membersCard(organizer).innerText(), /^Members\s+1 player/);

  assert.deepEqual(fake.unsupported, []);
  console.log("golf trip invite browser check: PASS");
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
