import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { activitySummary, parseActivityFeed, setupActivityChanges, validateAnnouncement, type TournamentActivityFeed } from "./activity.ts";
import { createTournament, database, load, profile, protectedSnapshot, quick, save, sqlFile } from "./testDatabase.ts";
import type { TournamentSetup } from "./setup.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
type Visibility = "public" | "unlisted" | "private";

async function feed(db: PGlite, viewer: string | null, slug = "texas-cup"): Promise<TournamentActivityFeed | null> {
  return parseActivityFeed((await db.query<{ f: unknown }>("select get_tournament_activity($1, 2027, $2) f", [slug, viewer])).rows[0].f);
}
const rawFeed = async (db: PGlite, viewer: string | null) => (await db.query<{ f: unknown }>("select get_tournament_activity('texas-cup', 2027, $1) f", [viewer])).rows[0].f;
const post = (db: PGlite, who: string, edition: string, body: string, visibility = "everyone", title: string | null = null) =>
  db.query("select post_commissioner_announcement($1, $2, $3, $4, $5)", [who, edition, title, body, visibility]);
const record = async (db: PGlite, who: string, edition: string, type: string, metadata: Record<string, unknown> = {}) =>
  (await db.query<{ r: boolean }>("select record_edition_activity($1, $2, $3, $4) r", [who, edition, type, JSON.stringify(metadata)])).rows[0].r;
/** What the save route does after a successful save. */
async function saveAndRecord(db: PGlite, who: string, edition: string, section: Parameters<typeof save>[3], input: unknown): Promise<TournamentSetup> {
  const before = await load(db, who, edition);
  const after = await save(db, who, edition, section, input);
  for (const change of setupActivityChanges(before, after)) await record(db, who, edition, change.type, change.metadata);
  return after;
}
const addMember = async (db: PGlite, edition: string, who: string, role: string) => db.query(
  "insert into tournament_members(tournament_id, profile_id, role) select tournament_id, $2, $3 from tournament_editions where id = $1", [edition, who, role]);

/** Texas Cup 2027: two teams, two players, one round; optionally published with the given visibility. */
async function texasCup(db: PGlite, options: { visibility?: Visibility; publish?: boolean } = {}) {
  const owner = await profile(db, "owner", { approved: true });
  const edition = await createTournament(db, owner, { ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], roundCount: 1, formats: [null] });
  const s = await load(db, owner, edition);
  await save(db, owner, edition, "basics", { name: "Texas Cup", shortName: "Texas Cup", description: "", destination: "Horseshoe Bay, TX",
    startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: options.visibility ?? "public" });
  await save(db, owner, edition, "players", { players: [{ name: "Ann Lee", email: "ann@secret.example", teamKey: s.teams[0].key }, { name: "Cy Park", teamKey: s.teams[1].key }] });
  await save(db, owner, edition, "rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100, allowEarlyFinish: true, allowConcessions: false, individualLeaderboard: true });
  await save(db, owner, edition, "rounds", { rounds: [{ day: 1, format: "Singles" }] });
  if (options.publish !== false) await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
  return { owner, edition };
}

test("the change detector ignores renames, colors and identical saves, and counts real changes", () => {
  const base = { edition: { startDate: "2027-04-15", endDate: "2027-04-17" }, teams: [{ key: "a" }, { key: "b" }],
    players: [{ id: "p1", name: "Ann", teamKey: "a" }, { id: "p2", name: "Cy", teamKey: "b" }],
    rounds: [{ number: 1, playDate: null, startType: null, startTime: null, courseId: null }] } as unknown as TournamentSetup;
  const clone = () => structuredClone(base);
  assert.deepEqual(setupActivityChanges(base, clone()), [], "identical save");
  const renamed = clone(); renamed.players[0].name = "Anne"; (renamed.teams[0] as { name?: string }).name = "Navy";
  assert.deepEqual(setupActivityChanges(base, renamed), [], "typo fix / team rename is not news");
  const added = clone(); added.players.push({ id: "p3", name: "Di", teamKey: "a" } as TournamentSetup["players"][number]);
  assert.deepEqual(setupActivityChanges(base, added), [{ type: "players_updated", metadata: { added: 1, removed: 0 } }]);
  const moved = clone(); moved.players[0].teamKey = "b";
  assert.deepEqual(setupActivityChanges(base, moved), [{ type: "teams_updated", metadata: { teamsAdded: 0, teamsRemoved: 0, playersMoved: 1 } }]);
  const rescheduled = clone(); rescheduled.rounds[0].playDate = "2027-04-15"; rescheduled.edition.endDate = "2027-04-18";
  assert.deepEqual(setupActivityChanges(base, rescheduled), [{ type: "schedule_updated", metadata: { roundsAdded: 0, roundsRemoved: 0, roundsRescheduled: 1, datesChanged: 1 } }]);
  assert.equal(activitySummary("players_updated", { added: 2, removed: 1 }), "2 players added, 1 player removed.");
  assert.equal(activitySummary("schedule_updated", { roundsRescheduled: 1 }), "1 round rescheduled.");
  // Future C4 types from a newer database are skipped, not crashed on.
  const parsed = parseActivityFeed({ viewer: {}, activity: [{ ref: "a2", type: "match_final", metadata: {} }, { ref: "a1", type: "players_updated", metadata: { added: 1, evil: "x" } }] });
  assert.deepEqual(parsed?.activity.map((a) => [a.ref, a.type, a.metadata, a.summary]), [["a1", "players_updated", { added: 1 }, "1 player added."]]);
  assert.deepEqual(validateAnnouncement({ body: "  Tee times are up.  ", title: "" }), { ok: true, data: { title: null, body: "Tee times are up.", visibility: "everyone" } });
  for (const bad of [{ body: "" }, { body: "x".repeat(2001) }, { body: "hi", title: "x".repeat(121) }, { body: "hi", visibility: "admins" }]) assert.equal(validateAnnouncement(bad).ok, false);
});

test("only commissioners (owner, organizer) and platform admins can post; viewing never grants posting", async () => {
  const db = await database();
  try {
    const { owner, edition } = await texasCup(db);
    const organizer = await profile(db, "organizer");
    const player = await profile(db, "player");
    const viewer = await profile(db, "viewer");
    const stranger = await profile(db, "stranger");
    const admin = await profile(db, "admin", { admin: true });
    const otherOwner = await profile(db, "other", { approved: true });
    await createTournament(db, otherOwner, { ...quick, name: "Other Cup", slug: "other-cup" });
    await addMember(db, edition, organizer, "organizer");
    await addMember(db, edition, player, "player");
    await addMember(db, edition, viewer, "viewer");

    for (const who of [owner, organizer, admin]) await post(db, who, edition, `Hello from ${who.slice(0, 4)}`);
    for (const who of [player, viewer, stranger, otherOwner]) {
      await assert.rejects(post(db, who, edition, "Let me in"), (e: { code?: string }) => e.code === "42501", "not a commissioner");
    }
    const capabilities = async (who: string | null) => {
      const f = await feed(db, who);
      return f && [f.viewer.role, f.viewer.canPostAnnouncement, f.viewer.canSeePlayersOnly, f.viewer.isPlatformAdmin];
    };
    assert.deepEqual(await capabilities(owner), ["owner", true, true, false]);
    assert.deepEqual(await capabilities(organizer), ["organizer", true, true, false]);
    assert.deepEqual(await capabilities(admin), [null, true, true, true], "platform admin: may post and see players-only everywhere");
    assert.deepEqual(await capabilities(player), ["player", false, true, false]);
    assert.deepEqual(await capabilities(viewer), ["viewer", false, false, false]);
    assert.deepEqual(await capabilities(stranger), [null, false, false, false]);
    assert.deepEqual(await capabilities(null), [null, false, false, false]);
    // Having read the feed changes nothing: the player still can't post or manage.
    await assert.rejects(post(db, player, edition, "Still no"), (e: { code?: string }) => e.code === "42501");
    assert.equal((await db.query<{ c: boolean }>("select can_manage_edition($1, $2) c", [player, edition])).rows[0].c, false);

    await assert.rejects(post(db, owner, edition, "   "), (e: { code?: string }) => e.code === "22023");
    await assert.rejects(post(db, owner, edition, "hi", "admins"), (e: { code?: string }) => e.code === "22023");
    await assert.rejects(db.query("insert into tournament_activity(edition_id, tournament_id, activity_type) select id, tournament_id, 'match_final' from tournament_editions where id = $1", [edition]),
      /tournament_activity_type_check/, "C4 types are reserved, not accepted yet");

    const host = await profile(db, "host", { host: true });
    await db.exec(sqlFile("platform_foundation.sql"));
    const maroon = (await db.query<{ id: string }>("select e.id from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy and e.season_year = 2027")).rows[0].id;
    await assert.rejects(post(db, host, maroon, "hi"), /Admin Center/, "The Maroon stays in the Admin Center");
    assert.equal((await db.query<{ f: unknown }>("select get_tournament_activity('the-maroon-tournament', 2027, $1) f", [host])).rows[0].f, null);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const sql of ["select * from tournament_activity", "select get_tournament_activity('texas-cup', 2027, null)",
        `select post_commissioner_announcement('${owner}', '${edition}', null, 'x', 'everyone')`, `select record_edition_activity('${owner}', '${edition}', 'players_updated', '{}')`]) {
        await assert.rejects(db.query(sql), /permission denied/, `${role}: ${sql}`);
      }
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

test("tournament visibility comes first; players-only never reaches visitors or viewers; no ids or emails", async () => {
  for (const visibility of ["public", "unlisted", "private"] as const) {
    const db = await database();
    try {
      const { owner, edition } = await texasCup(db, { visibility });
      const player = await profile(db, "player");
      const viewer = await profile(db, "viewer");
      const stranger = await profile(db, "stranger");
      await addMember(db, edition, player, "player");
      await addMember(db, edition, viewer, "viewer");
      const publicBefore = (await db.query<{ s: unknown }>("select get_public_tournament_site('texas-cup', 2027, null) s")).rows[0].s;
      await post(db, owner, edition, "Welcome, everyone!", "everyone", "Welcome");
      await post(db, owner, edition, "Players: dinner at 7.", "players_only");
      const publicAfter = (await db.query<{ s: unknown }>("select get_public_tournament_site('texas-cup', 2027, null) s")).rows[0].s;
      assert.deepEqual(publicAfter, publicBefore, `${visibility}: the public site reader is unchanged by activity`);

      const bodies = async (who: string | null) => (await feed(db, who))?.activity.filter((a) => a.type === "commissioner_announcement").map((a) => a.body) ?? null;
      const outsiders = visibility === "private" ? null : ["Welcome, everyone!"];
      assert.deepEqual(await bodies(null), outsiders, `${visibility}: signed-out visitor`);
      assert.deepEqual(await bodies(stranger), outsiders, `${visibility}: signed-in stranger`);
      assert.deepEqual(await bodies(viewer), ["Welcome, everyone!"], `${visibility}: viewer member — never players-only`);
      assert.deepEqual(await bodies(player), ["Players: dinner at 7.", "Welcome, everyone!"], `${visibility}: player sees both, newest first`);
      assert.deepEqual(await bodies(owner), ["Players: dinner at 7.", "Welcome, everyone!"]);

      const visitorJson = JSON.stringify(await rawFeed(db, visibility === "private" ? viewer : null));
      assert.ok(!visitorJson.includes("dinner at 7") && !visitorJson.includes("players_only"), "players-only leaves no trace for outsiders");
      assert.ok(!visitorJson.includes('"a2"'), "refs are numbered within what the viewer sees (no gap hinting at hidden posts)");
      assert.ok(!UUID.test(JSON.stringify(await rawFeed(db, player))) && !JSON.stringify(await rawFeed(db, player)).includes("secret.example"), "no ids or emails");
      assert.equal((await feed(db, visibility === "private" ? viewer : null))?.activity.find((a) => a.type === "commissioner_announcement")?.authorName, null, "no author name for non-players");
      assert.equal((await feed(db, player))?.activity.find((a) => a.body === "Welcome, everyone!")?.authorName, "owner", "members see who posted");
    } finally { await db.close(); }
  }
});

test("unpublished: only commissioners see the feed; wrong year, test years and unknown slugs resolve nothing", async () => {
  const db = await database();
  try {
    const { owner, edition } = await texasCup(db, { publish: false });
    const player = await profile(db, "player");
    await addMember(db, edition, player, "player");
    await post(db, owner, edition, "Coming soon", "everyone");
    for (const who of [null, player]) assert.equal(await feed(db, who), null, "not published yet");
    const f = await feed(db, owner);
    assert.deepEqual([f?.published, f?.activity.map((a) => a.body)], [false, ["Coming soon"]], "commissioner preview");
    assert.equal((await db.query<{ f: unknown }>("select get_tournament_activity('texas-cup', 2028, $1) f", [owner])).rows[0].f, null);
    assert.equal((await db.query<{ f: unknown }>("select get_tournament_activity('nope', 2027, $1) f", [owner])).rows[0].f, null);
  } finally { await db.close(); }
});

test("automatic events: published once, real changes only, merged when repeated, nothing before publishing", async () => {
  const db = await database();
  try {
    const before = await protectedSnapshot(db);
    const { owner, edition } = await texasCup(db, { publish: false });
    const types = async () => (await feed(db, owner))!.activity.map((a) => [a.type, a.summary]);

    // Before publishing: setup churn isn't news.
    let s = await saveAndRecord(db, owner, edition, "players", { players: [...(await load(db, owner, edition)).players.map((p) => ({ id: p.id, name: p.name, teamKey: p.teamKey })), { name: "Di Moss" }] });
    assert.deepEqual(await types(), []);
    assert.equal(await record(db, owner, edition, "tournament_published"), false, "not published yet");

    await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
    assert.equal(await record(db, owner, edition, "tournament_published"), true);
    await db.query("select set_edition_published($1, $2, false)", [owner, edition]);
    await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
    assert.equal(await record(db, owner, edition, "tournament_published"), false, "republishing is silent");

    // Trivial edits: nothing.
    await saveAndRecord(db, owner, edition, "branding", { primary: "#123456", secondary: "#ffffff", accent: "#abcdef" });
    s = await saveAndRecord(db, owner, edition, "players", { players: s.players.map((p) => ({ id: p.id, name: p.name === "Ann Lee" ? "Anne Lee" : p.name, teamKey: p.teamKey })) });
    s = await saveAndRecord(db, owner, edition, "players", { players: s.players.map((p) => ({ id: p.id, name: p.name, teamKey: p.teamKey })) });
    assert.deepEqual(await types(), [["tournament_published", "The tournament site is live."]], "color, typo and identical saves add nothing");

    // Real changes, merged while they keep coming.
    s = await saveAndRecord(db, owner, edition, "players", { players: [...s.players.map((p) => ({ id: p.id, name: p.name, teamKey: p.teamKey })), { name: "Ed Ruiz" }] });
    s = await saveAndRecord(db, owner, edition, "players", { players: [...s.players.map((p) => ({ id: p.id, name: p.name, teamKey: p.teamKey })), { name: "Flo Diaz" }] });
    assert.deepEqual((await types())[0], ["players_updated", "2 players added."], "two quick saves → one merged event");
    s = await saveAndRecord(db, owner, edition, "players", { players: s.players.map((p, i) => ({ id: p.id, name: p.name, teamKey: i === 0 ? s.teams[1].key : p.teamKey })) });
    await saveAndRecord(db, owner, edition, "schedule", { rounds: [{ number: 1, playDate: "2027-04-15", startType: "tee_times", startTime: "08:30" }] });
    assert.deepEqual((await types()).slice(0, 3), [["schedule_updated", "1 round rescheduled."], ["teams_updated", "1 player changed teams."], ["players_updated", "2 players added."]]);

    // The recorder only keeps whitelisted, non-negative counts, and only for commissioners.
    const stranger = await profile(db, "stranger");
    await assert.rejects(record(db, stranger, edition, "players_updated", { added: 1 }), (e: { code?: string }) => e.code === "42501");
    await assert.rejects(record(db, owner, edition, "match_final", {}), (e: { code?: string }) => e.code === "22023");
    assert.equal(await record(db, owner, edition, "teams_updated", { playersMoved: -5, email: "x@y.z" }), false, "junk-only metadata records nothing");
    const stored = (await db.query<{ m: unknown }>("select jsonb_agg(metadata) m from tournament_activity where edition_id = $1", [edition])).rows[0].m;
    assert.ok(!JSON.stringify(stored).includes("@"), "only counts are stored");

    const body = (await db.query<{ d: string }>(`select string_agg(pg_get_functiondef(p.oid), '') d from pg_proc p
      where p.proname in ('get_tournament_activity', 'post_commissioner_announcement', 'record_edition_activity')`)).rows[0].d;
    assert.ok(!/live_|career_|broadcast_/.test(body), "never reads or writes live scoring");
    assert.deepEqual(await protectedSnapshot(db), before, "no live-scoring or Maroon rows changed");
  } finally { await db.close(); }
});
