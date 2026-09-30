import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assessReadiness } from "./readiness.ts";
import { validateSection } from "./sectionRules.ts";
import { parseSetup } from "./setup.ts";
import { createTournament, database, load, percent, profile, protectedSnapshot, quick, save, sqlFile } from "./testDatabase.ts";
import type { TournamentSetup } from "./setup.ts";

test("every section saves independently, survives a reload, and moves readiness forward; nothing live or Maroon changes", async () => {
  const db = await database();
  try {
    const before = await protectedSnapshot(db);
    assert.ok(before.tables.length >= 20, `protected tables found: ${before.tables.length}`);
    const owner = await profile(db, "owner", { approved: true });
    const edition = await createTournament(db, owner);
    let setup = await load(db, owner, edition);
    let last = percent(setup);
    const rises = (label: string, next: TournamentSetup) => { const now = percent(next); assert.ok(now > last, `${label}: ${last}% -> ${now}%`); last = now; };

    setup = await save(db, owner, edition, "basics", { name: "Texas Cup", shortName: "Texas Cup", description: "Blue vs Gold", destination: "Horseshoe Bay, TX",
      startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: "unlisted" });
    rises("basics", setup);
    setup = await save(db, owner, edition, "teams", { competitionType: "teams", teams: [{ name: "Blue", color: "#1f4e9c" }, { name: "Gold", color: "#b8860b" }] });
    rises("teams", setup);
    const [blue, gold] = setup.teams;
    setup = await save(db, owner, edition, "rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "net", allowancePercent: 85 });
    rises("rules", setup);
    setup = await save(db, owner, edition, "rounds", { rounds: [{ day: 1, label: "Morning", format: "Fourball" }, { day: 2, format: "Foursome" }, { day: 3, format: "Singles" }] });
    rises("rounds", setup);
    assert.equal(assessReadiness(setup, { liveScoringAvailable: false }).stage, "Ready to Publish");

    setup = await save(db, owner, edition, "players", { expectedPlayerCount: 8, players: Array.from({ length: 8 }, (_, i) => ({ name: `Golfer ${i + 1}`, email: `g${i + 1}@example.com`, handicap: i, teamKey: i < 4 ? blue.key : gold.key })) });
    rises("players", setup);
    setup = await save(db, owner, edition, "teams", { competitionType: "teams", teams: [
      { id: blue.id, name: "Blue Team", color: "#1f4e9c", captainPlayerId: setup.players.find((p) => p.teamKey === blue.key)!.id },
      { id: gold.id, name: "Gold Team", color: "#b8860b" }] });
    setup = await save(db, owner, edition, "courses", { courses: [{ name: "Horseshoe Bay", state: "TX", teeName: "Blue", par: 72, yards: 6800, rating: 72.1, slope: 131 }] });
    rises("courses", setup);
    const course = setup.courses[0].id;
    setup = await save(db, owner, edition, "rounds", { rounds: setup.rounds.map((r) => ({ day: r.day, label: r.label, format: r.format, courseId: course })) });
    rises("rounds with courses", setup);
    setup = await save(db, owner, edition, "schedule", { rounds: setup.rounds.map((r, i) => ({ number: r.number, playDate: `2027-04-1${5 + i}`, startType: "tee_times", startTime: "08:30" })) });
    rises("schedule", setup);
    setup = await save(db, owner, edition, "branding", { primary: "#1f4e9c", secondary: "#ffffff", accent: "#b8860b" });
    setup = await save(db, owner, edition, "website", { stats: false, media: false });
    setup = await save(db, owner, edition, "media", { mode: "device_external", links: [{ label: "Highlights", url: "https://youtube.com/@texascup" }] });

    // Reload: every section is exactly what was saved.
    const reloaded = await load(db, owner, edition);
    assert.deepEqual(reloaded, setup);
    assert.deepEqual({ name: reloaded.tournament.name, dest: reloaded.edition.destination, start: reloaded.edition.startDate, vis: reloaded.tournament.visibility },
      { name: "Texas Cup", dest: "Horseshoe Bay, TX", start: "2027-04-15", vis: "unlisted" });
    assert.deepEqual(reloaded.teams.map((t) => [t.name, t.key]), [["Blue Team", blue.key], ["Gold Team", gold.key]]);
    assert.equal(reloaded.teams[0].captainPlayerId, reloaded.players[0].id);
    assert.deepEqual(reloaded.players.map((p) => [p.name, p.handicap, p.teamKey]).slice(0, 2), [["Golfer 1", 0, blue.key], ["Golfer 2", 1, blue.key]]);
    assert.deepEqual(reloaded.rounds.map((r) => [r.number, r.format, r.courseId, r.playDate, r.startTime]), [
      [1, "Fourball", course, "2027-04-15", "08:30"], [2, "Foursome", course, "2027-04-16", "08:30"], [3, "Singles", course, "2027-04-17", "08:30"]]);
    assert.equal(reloaded.scoring?.handicap, "net");
    assert.deepEqual({ stats: reloaded.site.stats, media: reloaded.site.media, leaderboard: reloaded.site.leaderboard }, { stats: false, media: false, leaderboard: true });
    assert.deepEqual(reloaded.media, { mode: "device_external", links: [{ label: "Highlights", url: "https://youtube.com/@texascup" }] });

    // Planned rounds changing their plan keeps their schedule; shrinking the plan drops the extras.
    const trimmed = await save(db, owner, edition, "rounds", { rounds: reloaded.rounds.slice(0, 2).map((r) => ({ day: r.day, label: r.label, format: r.format, courseId: r.courseId })) });
    assert.deepEqual(trimmed.rounds.map((r) => [r.number, r.playDate]), [[1, "2027-04-15"], [2, "2027-04-16"]]);

    // Publish is its own action; readiness then waits on nothing the organizer controls.
    const published = parseSetup((await db.query<{ s: unknown }>("select set_edition_published($1, $2, true) as s", [owner, edition])).rows[0].s);
    assert.ok(published.edition.publishedAt);
    assert.equal(published.edition.status, "scheduled");
    const r = assessReadiness(published, { liveScoringAvailable: false });
    assert.equal(r.stage, "Blocked");
    assert.equal(r.playReady, false);
    const unpublished = parseSetup((await db.query<{ s: unknown }>("select set_edition_published($1, $2, false) as s", [owner, edition])).rows[0].s);
    assert.equal(unpublished.edition.publishedAt, null);

    // Not one live-scoring, archive, broadcast, odds or Maroon row changed.
    assert.deepEqual(await protectedSnapshot(db), before);
  } finally {
    await db.close();
  }
});

test("only the tournament's organizers can see or change it; players, strangers and other organizers can't", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const other = await profile(db, "other", { approved: true });
    const stranger = await profile(db, "stranger");
    const player = await profile(db, "player");
    const cohost = await profile(db, "cohost");
    const admin = await profile(db, "admin", { admin: true });
    const edition = await createTournament(db, owner);
    const otherEdition = await createTournament(db, other, { ...quick, name: "Other Cup", slug: "other-cup" });
    const tournament = (await db.query<{ t: string }>("select tournament_id t from tournament_editions where id = $1", [edition])).rows[0].t;
    await db.query("insert into tournament_members(tournament_id, profile_id, role) values ($1,$2,'player'), ($1,$3,'organizer')", [tournament, player, cohost]);

    const attempt = (who: string, ed = edition) => db.query("select save_tournament_section($1, $2, 'branding', '{\"primary\":\"#000000\",\"secondary\":\"#ffffff\",\"accent\":\"#cccccc\"}'::jsonb)", [who, ed]);
    for (const [who, label] of [[stranger, "stranger"], [player, "player"], [other, "another tournament's owner"]] as const) {
      await assert.rejects(attempt(who), (e: { code?: string }) => e.code === "42501", `${label} must not save`);
      await assert.rejects(db.query("select get_tournament_setup($1, $2)", [who, edition]), (e: { code?: string }) => e.code === "42501", `${label} must not read`);
      await assert.rejects(db.query("select set_edition_published($1, $2, true)", [who, edition]), (e: { code?: string }) => e.code === "42501", `${label} must not publish`);
    }
    await attempt(cohost);
    await attempt(admin);
    await attempt(owner);
    await assert.rejects(attempt(owner, otherEdition), (e: { code?: string }) => e.code === "42501", "an owner can't reach into another tournament");

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select get_tournament_setup($1, $2)", [owner, edition]), /permission denied/);
      await assert.rejects(db.exec("select * from edition_rounds"), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("ids from another tournament are refused even if a caller skips the section rules", async () => {
  const db = await database();
  try {
    const a = await profile(db, "a", { approved: true });
    const b = await profile(db, "b", { approved: true });
    const edA = await createTournament(db, a, { ...quick, competitionType: "teams", teamNames: ["Red", "Blue"] });
    const edB = await createTournament(db, b, { ...quick, name: "B Cup", slug: "b-cup", competitionType: "teams", teamNames: ["Green", "White"] });
    await save(db, b, edB, "players", { players: [{ name: "B Player", teamKey: (await load(db, b, edB)).teams[0].key }] });
    await save(db, b, edB, "courses", { courses: [{ name: "B Course" }] });
    const setupB = await load(db, b, edB);
    const raw = (section: string, data: unknown) => db.query("select save_tournament_section($1, $2, $3, $4)", [a, edA, section, JSON.stringify(data)]);
    await assert.rejects(raw("teams", { competitionType: "teams", teams: [{ id: setupB.teams[0].id, name: "Stolen", color: "#000000" }] }), /Unknown team/);
    await assert.rejects(raw("players", { players: [{ id: setupB.players[0].id, name: "Stolen" }] }), /Unknown player/);
    await assert.rejects(raw("courses", { courses: [{ id: setupB.courses[0].id, name: "Stolen" }] }), /Unknown course/);
    await assert.rejects(raw("rounds", { rounds: [{ format: "Singles", courseId: setupB.courses[0].id }] }), /foreign key/);
    // Team keys are per edition: B's "team-1" key resolves to A's own team-1, never to B's team.
    await raw("players", { players: [{ name: "X", teamKey: setupB.teams[0].key }] });
    const teamOfX = (await db.query<{ edition_id: string }>(`select t.edition_id from edition_roster r join tournament_players p on p.id = r.tournament_player_id
      join edition_teams t on t.id = r.team_id where p.display_name = 'X'`)).rows;
    assert.deepEqual(teamOfX, [{ edition_id: edA }]);
    await assert.rejects(raw("players", { players: [{ name: "Y", teamKey: "no-such-team" }] }), /Unknown team/);
    await assert.rejects(raw("bogus", {}), /Unknown section/);
    assert.deepEqual(await load(db, b, edB), setupB, "tournament B is untouched");
  } finally {
    await db.close();
  }
});

test("media: commercial tournaments choose none or linked media; hosted media is refused without the entitlement", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const edition = await createTournament(db, owner);
    const setup = await load(db, owner, edition);
    assert.deepEqual(setup.media, { mode: "none", links: [] });
    const hosted = validateSection("media", { mode: "maroon_hosted" }, setup);
    assert.equal(hosted.ok, false);
    await assert.rejects(db.query(`select save_tournament_section($1, $2, 'media', '{"mode":"maroon_hosted","links":[]}'::jsonb)`, [owner, edition]), /Hosted media isn't available/);
    const saved = await save(db, owner, edition, "media", { mode: "none" });
    assert.equal(assessReadiness(saved, { liveScoringAvailable: false }).sections.find((s) => s.name === "Media")?.requiredFor, "optional");
  } finally {
    await db.close();
  }
});

test("The Maroon Tournament can't be edited or published from this dashboard (it's run from the Admin Center)", async () => {
  const db = await database();
  try {
    const host = await profile(db, "host", { host: true });
    await db.exec(sqlFile("platform_foundation.sql")); // re-seed so the new host is an owner of The Maroon
    const maroon2027 = (await db.query<{ id: string }>("select e.id from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy and e.season_year = 2027")).rows[0].id;
    const before = await protectedSnapshot(db);
    await assert.rejects(db.query(`select save_tournament_section($1, $2, 'branding', '{"primary":"#000000","secondary":"#ffffff","accent":"#cccccc"}'::jsonb)`, [host, maroon2027]), /managed in the Admin Center/);
    await assert.rejects(db.query("select set_edition_published($1, $2, true)", [host, maroon2027]), /managed in the Admin Center/);
    assert.deepEqual(await protectedSnapshot(db), before);
  } finally {
    await db.close();
  }
});

