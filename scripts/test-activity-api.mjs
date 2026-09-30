// End-to-end HTTP test of tournament activity: commissioner announcements,
// the viewer-aware activity feed and the automatic publish/players events,
// through the real API routes of a production build pointed at
// scripts/fake-supabase.mjs (all real migrations in an in-memory Postgres).
// Never touches a real database.
//
// Run from a directory with a finished `next build`:
//   node scripts/test-activity-api.mjs
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3108);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54402);
const app = `http://localhost:${APP_PORT}`;
const fake = await startFakeSupabase({ port: FAKE_PORT });
const call = async (fn, args) => (await fake.db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows[0].r;

async function seed({ slug, name, visibility, publish }) {
  const owner = await fake.addUser({ name: `owner-${slug}`, approved: true });
  const { editionId } = await call("create_tournament_shell", [owner.id, { name, shortName: name, slug, seasonYear: 2027, startDate: null, endDate: null, timezone: "America/Chicago",
    visibility, branding: null, teams: [{ key: "team-1", name: "Blue", color: "#1f4e9c" }, { key: "team-2", name: "Gold", color: "#d4a017" }], scoring: { mode: "match_play" },
    plan: { competitionType: "teams", expectedPlayerCount: 4, rounds: [{ format: "Singles" }] } }]);
  const save = (section, data) => call("save_tournament_section", [owner.id, editionId, section, data]);
  await save("basics", { name, shortName: name, description: null, destination: "Horseshoe Bay, TX", startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility });
  await save("players", { players: ["Ann Lee", "Cy Park"].map((n, i) => ({ name: n, email: `p${i}@secret.example`, teamKey: i ? "team-2" : "team-1" })) });
  await save("rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100 });
  if (publish) await call("set_edition_published", [owner.id, editionId, true]);
  const tournamentId = (await fake.db.query("select tournament_id t from tournament_editions where id = $1", [editionId])).rows[0].t;
  return { owner, editionId, tournamentId };
}
const texas = await seed({ slug: "texas-cup", name: "Texas Cup", visibility: "public", publish: false });
const hidden = await seed({ slug: "private-cup", name: "Private Cup", visibility: "private", publish: true });
const player = await fake.addUser({ name: "player" });
const stranger = await fake.addUser({ name: "stranger" });
const admin = await fake.addUser({ name: "platformadmin", platformRole: "admin" });
for (const t of [texas, hidden]) await fake.db.query("insert into tournament_members(tournament_id, profile_id, role) values ($1, $2, 'player')", [t.tournamentId, player.id]);

const server = spawn(process.platform === "win32" ? `npx.cmd next start -p ${APP_PORT}` : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const cookie = (user) => { const c = fake.sessionCookie(user); return `${c.name}=${c.value}`; };
async function api(path, { as = null, method = "GET", body } = {}) {
  const response = await fetch(`${app}${path}`, { method, headers: { ...(as ? { Cookie: cookie(as) } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const T = "/api/platform/tournaments/texas-cup/2027";
const feed = (as) => api(`${T}/activity`, { as });
const kinds = (b) => b.activity.map((a) => a.type === "commissioner_announcement" ? `announcement:${a.body}` : `${a.type}:${a.summary}`);

let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/tournaments/new`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Unpublished: only the commissioner sees the feed.
  for (const as of [null, player, stranger]) assert.equal((await feed(as)).status, 404, "unpublished feed hidden");
  assert.deepEqual((await feed(texas.owner)).body.viewer, { signedIn: true, role: "owner", isPlatformAdmin: false, canPostAnnouncement: true, canSeePlayersOnly: true });

  // Publishing through the real route records one event.
  assert.equal((await api(`${T}/publish`, { as: texas.owner, method: "POST", body: { publish: true } })).status, 200);
  assert.deepEqual(kinds((await feed(null)).body), ["tournament_published:The tournament site is live."]);

  // Announcements: commissioners and admins only.
  assert.equal((await api(`${T}/announcements`, { as: texas.owner, method: "POST", body: { title: "Welcome", body: "See you on the first tee!", visibility: "everyone" } })).status, 201);
  assert.equal((await api(`${T}/announcements`, { as: texas.owner, method: "POST", body: { body: "Players: dinner at 7.", visibility: "players_only" } })).status, 201);
  assert.equal((await api(`${T}/announcements`, { as: admin, method: "POST", body: { body: "Platform note." } })).status, 201, "platform admin may post");
  for (const as of [player, stranger, null]) assert.equal((await api(`${T}/announcements`, { as, method: "POST", body: { body: "Let me in" } })).status, 404);
  assert.equal((await api(`${T}/announcements`, { as: texas.owner, method: "POST", body: { body: "" } })).status, 400);
  assert.equal((await api(`${T}/announcements`, { as: texas.owner, method: "POST", body: { body: "hi", visibility: "admins" } })).status, 400);

  // Visitors get everyone-items only, without author names; players get both.
  const visitor = (await feed(null)).body;
  assert.deepEqual(kinds(visitor), ["announcement:Platform note.", "announcement:See you on the first tee!", "tournament_published:The tournament site is live."]);
  assert.ok(visitor.activity.every((a) => a.authorName === null) && !JSON.stringify(visitor).includes("dinner"));
  assert.deepEqual(visitor.viewer, { signedIn: false, role: null, isPlatformAdmin: false, canPostAnnouncement: false, canSeePlayersOnly: false });
  const member = (await feed(player)).body;
  assert.deepEqual(kinds(member).slice(0, 2), ["announcement:Platform note.", "announcement:Players: dinner at 7."]);
  assert.equal(member.activity.find((a) => a.body === "See you on the first tee!").authorName, "owner-texas-cup");
  assert.deepEqual([member.viewer.canPostAnnouncement, member.viewer.canSeePlayersOnly], [false, true]);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(member)) && !JSON.stringify(member).includes("secret.example"), "no ids or emails");

  // Dashboard saves through the real route: a new player is news; a color change isn't.
  const setup = (await api(T, { as: texas.owner })).body.setup;
  const players = setup.players.map((p) => ({ id: p.id, name: p.name, email: p.email ?? "", teamKey: p.teamKey }));
  assert.equal((await api(`${T}/sections/players`, { as: texas.owner, method: "PATCH", body: { players: [...players, { name: "Di Moss", email: "", teamKey: "team-1" }] } })).status, 200);
  assert.equal((await api(`${T}/sections/branding`, { as: texas.owner, method: "PATCH", body: { primary: "#000000", secondary: "#ffffff", accent: "#cccccc" } })).status, 200);
  assert.deepEqual(kinds((await feed(null)).body)[0], "players_updated:1 player added.");
  assert.equal((await feed(null)).body.activity.length, 4, "the color change added nothing (visitor: published, 2 public announcements, players_updated)");

  // Private tournaments: outsiders get nothing at all.
  assert.equal((await api("/api/platform/tournaments/private-cup/2027/activity")).status, 404);
  assert.equal((await api("/api/platform/tournaments/private-cup/2027/activity", { as: stranger })).status, 404);
  assert.equal((await api("/api/platform/tournaments/private-cup/2027/activity", { as: player })).status, 200);

  // The public site itself still renders as before.
  assert.equal((await fetch(`${app}/t/texas-cup/2027`)).status, 200);
  console.log("Passed (activity API): unpublished feed commissioner-only, publish event via the real route, announcements by owner/admin only (player/stranger/signed-out 404, validation 400), visitors see everyone-items without authors, players see players-only, players_updated from a real save, color change silent, private feed members-only, no ids/emails, public site unchanged.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error("--- app server log (tail) ---\n" + serverLog.split("\n").slice(-40).join("\n"));
} finally {
  if (fake.unsupported.length) console.log("fake-supabase: unsupported calls seen (not used by the tested flow):", [...new Set(fake.unsupported)].slice(0, 10));
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
