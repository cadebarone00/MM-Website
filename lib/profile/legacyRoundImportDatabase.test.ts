import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { playerRoundsFromJson, profileHistoryFromJson } from "../platform/playerRoundsRows.ts";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { modernStats } from "./profileReadModel.ts";

// --- Database: supabase/legacy_round_import.sql — old Maroon rounds → player_rounds -----------------------------
// Tooling only: nothing imports until import_legacy_rounds(false) is run by hand. Old tables are only read.

type Report = {
  dryRun: boolean; players: { playerSlug: string; username: string | null; mapped: boolean; problem: string | null }[];
  counts: Record<string, number>; skipped: { playerSlug: string; sourceKey: string; reason: string }[];
};
const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5]; // 72
const TEE = (courseId: string, extra: Record<string, unknown> = {}) => ({ courseId, teeSetId: "blue", teeSetName: "Blue", rating: 72, slope: 113, holes: [], ...extra });

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["player_rounds.sql", "legacy_round_import.sql", "legacy_round_import.sql"]) await db.exec(sqlFile(file));
  return db;
}
const run = async (db: PGlite, dryRun: boolean, slug: string | null = null) =>
  (await db.query<{ r: Report }>("select import_legacy_rounds($1, $2) as r", [dryRun, slug])).rows[0].r;
const keys = async (db: PGlite, who: string) =>
  (await db.query<{ k: string }>("select source_key k from player_rounds where profile_id = $1 order by source_key", [who])).rows.map((r) => r.k);
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;

/** A legacy player slot claimed by a profile (the normal, mappable case). */
async function legacyPlayer(db: PGlite, slug: string, username: string) {
  await db.query("insert into player_slots (player_slug) values ($1) on conflict do nothing", [slug]);
  const id = await profile(db, username);
  await db.query("update profiles set player_slug = $1 where id = $2", [slug, id]);
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [id, slug]);
  return id;
}
async function course(db: PGlite, name: string) {
  return (await one<string>(db, "insert into live_courses (name, holes) values ($1, '[]') returning id as r", [name]))!;
}
/** A logged round (handicap_rounds) with 18 hole rows; strokes = par + over on hole 1. */
async function loggedRound(db: PGlite, slug: string, courseId: string, date: string, over = 10) {
  const strokes = PAR.map((p, i) => i === 0 ? p + over : p);
  const total = strokes.reduce((a, b) => a + b, 0);
  const id = (await one<string>(db, `insert into handicap_rounds (player_slug, course_id, tee_set_id, tee_set_name, rating, slope, date_played, total_score, differential)
    values ($1, $2, 'blue', 'Blue', 72, 113, $3, $4, $5) returning id as r`, [slug, courseId, date, total, Math.round((total - 72) * 10) / 10]))!;
  for (let h = 0; h < 18; h++) {
    await db.query("insert into handicap_round_holes (round_id, hole, par, yards, score, putts, fir, gir) values ($1, $2, $3, 400, $4, 2, '1', true)", [id, h + 1, PAR[h], strokes[h]]);
  }
  return { id, total };
}
/** A 2024–26 archived tournament card. */
async function archivedCard(db: PGlite, slug: string, tournament: string, round: number, format: string, holes = 18, tee: unknown = null) {
  const id = (await one<string>(db, `insert into archived_scorecard_rounds (tournament_slug, player_slug, round, course, format, handicap_setup, played_on)
    values ($1, $2, $3, 'Desert Willow', $4, $5, '2026-04-24') returning id as r`, [tournament, slug, round, format, tee === null ? null : JSON.stringify(tee)]))!;
  for (let h = 0; h < holes; h++) {
    await db.query("insert into archived_scorecard_holes (round_id, hole, par, yards, score, putts, fir, gir) values ($1, $2, $3, 400, $4, 2, '0', false)", [id, h + 1, PAR[h], PAR[h] + 1]);
  }
  return id;
}

test("dry run reports everything and writes nothing; the import then brings each round in exactly once — and again changes nothing", async () => {
  const db = await setup();
  const cade = await legacyPlayer(db, "cade-barone", "cade");
  const desert = await course(db, "Desert Willow");
  await loggedRound(db, "cade-barone", desert, "2026-05-02");
  await archivedCard(db, "cade-barone", "2026-palm-springs", 1, "Singles", 18, TEE(desert));
  const legacyBefore = await one<number>(db, "select (select count(*) from handicap_rounds) + (select count(*) from archived_scorecard_rounds) + (select count(*) from handicap_round_holes) as r");

  const dry = await run(db, true);
  assert.equal(dry.dryRun, true);
  assert.deepEqual([dry.counts.candidates, dry.counts.wouldImport, dry.counts.skipped], [2, 2, 0]);
  assert.deepEqual(dry.players, [{ playerSlug: "cade-barone", username: "cade", mapped: true, problem: null }]);
  assert.deepEqual(await keys(db, cade), [], "a dry run writes nothing");

  const first = await run(db, false);
  assert.deepEqual([first.counts.imported, first.counts.alreadyImported], [2, 0]);
  const imported = await keys(db, cade);
  assert.equal(imported.length, 2);
  assert.ok(imported.includes("legacy:maroon:2026:r1"));
  assert.ok(imported.some((k) => k.startsWith("legacy:handicap:")));
  // Re-running (and re-running the dry run) never duplicates.
  const second = await run(db, false);
  assert.deepEqual([second.counts.imported, second.counts.alreadyImported], [0, 2]);
  assert.equal((await run(db, true)).counts.wouldImport, 0);
  assert.deepEqual(await keys(db, cade), imported);
  // The old tables are only read.
  assert.equal(await one<number>(db, "select (select count(*) from handicap_rounds) + (select count(*) from archived_scorecard_rounds) + (select count(*) from handicap_round_holes) as r"), legacyBefore);
});

test("each round goes to the right profile; unmapped and ambiguous players are refused, never guessed", async () => {
  const db = await setup();
  const desert = await course(db, "Desert Willow");
  const cade = await legacyPlayer(db, "cade-barone", "cade");
  const cam = await legacyPlayer(db, "cam-latto", "cam");
  await loggedRound(db, "cade-barone", desert, "2026-05-02");
  await loggedRound(db, "cam-latto", desert, "2026-05-02", 4);
  // Nobody has claimed this player yet.
  await db.query("insert into player_slots (player_slug) values ('jake-ross')");
  await loggedRound(db, "jake-ross", desert, "2026-05-02");
  // Slot claimed by one profile, slug carried by another: ambiguous.
  await db.query("insert into player_slots (player_slug) values ('ty-moss')");
  const ty = await profile(db, "ty");
  const other = await profile(db, "other");
  await db.query("update profiles set player_slug = 'ty-moss' where id = $1", [ty]);
  await db.query("update player_slots set claimed_by = $1 where player_slug = 'ty-moss'", [other]);
  await loggedRound(db, "ty-moss", desert, "2026-05-02");

  const report = await run(db, false);
  assert.equal(report.counts.imported, 2);
  const players = Object.fromEntries(report.players.map((p) => [p.playerSlug, [p.mapped, p.problem]]));
  assert.deepEqual(players["cade-barone"], [true, null]);
  assert.match(String(players["jake-ross"][1]), /^unmapped/);
  assert.match(String(players["ty-moss"][1]), /^ambiguous/);
  assert.deepEqual(report.skipped.map((s) => s.playerSlug).sort(), ["jake-ross", "ty-moss"]);
  // Right golfer, right score.
  const totals = async (who: string) => (await db.query<{ total: number }>("select total from player_rounds where profile_id = $1", [who])).rows.map((r) => r.total);
  assert.deepEqual([await totals(cade), await totals(cam)], [[82], [76]]);
  assert.deepEqual([await keys(db, ty), await keys(db, other)], [[], []]);
  // One player only.
  assert.equal((await run(db, true, "cade-barone")).players.length, 1);
});

test("two real rounds at one course on one day stay two rounds; one round in both archives imports once", async () => {
  const db = await setup();
  const desert = await course(db, "Desert Willow");
  const cade = await legacyPlayer(db, "cade-barone", "cade");
  const morning = await loggedRound(db, "cade-barone", desert, "2026-05-02", 10);
  const afternoon = await loggedRound(db, "cade-barone", desert, "2026-05-02", 10); // same day, course and score
  // 2027 round 1 is in the 2027+ archive; the same round is also in the old archive.
  await db.query(`insert into career_archive_rounds (season_year, round, player_slug, course, played_on, format, status, holes)
    values (2027, 1, 'cade-barone', 'Desert Willow', '2027-04-23', 'Singles', 'final', '[]')`);
  for (let h = 1; h <= 18; h++) await db.query("insert into career_archive_live_holes (season_year, round, player_slug, hole, score) values (2027, 1, 'cade-barone', $1, 4)", [h]);
  await archivedCard(db, "cade-barone", "2027-scottsdale", 1, "Singles");
  // A rehearsal-season round never imports; neither does one that isn't official yet.
  await db.query(`insert into career_archive_rounds (season_year, round, player_slug, course, played_on, format, status, holes)
    values (2034, 1, 'cade-barone', 'Test', '2034-04-23', 'Singles', 'final', '[]'), (2027, 2, 'cade-barone', 'Desert Willow', '2027-04-24', 'Singles', 'live', '[]')`);

  const report = await run(db, false);
  assert.equal(report.counts.duplicates, 1);
  assert.deepEqual(await keys(db, cade), [`legacy:handicap:${afternoon.id}`, `legacy:handicap:${morning.id}`, "legacy:maroon:2027:r1"].sort());
  assert.equal(await one<string>(db, "select provenance->>'system' as r from player_rounds where source_key = 'legacy:maroon:2027:r1'"), "archived_scorecard_rounds", "the 2024–26 archive wins");
  assert.ok(report.skipped.some((s) => s.sourceKey === "legacy:maroon:2027:r2" && /official/.test(s.reason)));
});

test("handicap: only own-ball, full 18, single verified tee rounds count; the rest still import with a reason", async () => {
  const db = await setup();
  const desert = await course(db, "Desert Willow");
  const cade = await legacyPlayer(db, "cade-barone", "cade");
  await archivedCard(db, "cade-barone", "2026-palm-springs", 1, "Singles", 18, TEE(desert));                           // counts
  await archivedCard(db, "cade-barone", "2026-palm-springs", 2, "Scramble", 18, TEE(desert));                          // team format
  await archivedCard(db, "cade-barone", "2026-palm-springs", 3, "Fourball", 18, null);                                 // no tee
  await archivedCard(db, "cade-barone", "2026-palm-springs", 4, "Singles", 18, TEE(desert, { holeTeeSetIds: { 1: "white" } })); // mixed tees
  await archivedCard(db, "cade-barone", "2026-palm-springs", 5, "Singles", 9, TEE(desert));                            // 9 holes
  await archivedCard(db, "cade-barone", "2026-palm-springs", 6, "Singles", 12, TEE(desert));                           // incomplete: skipped
  const report = await run(db, false);
  assert.deepEqual([report.counts.imported, report.counts.countsForHandicap], [5, 1]);
  assert.match(report.skipped.find((s) => s.sourceKey === "legacy:maroon:2026:r6")!.reason, /incomplete card \(12 holes/);
  const rows = (await db.query<{ k: string; c: boolean; reason: string | null; d: string | null }>(
    "select source_key k, counts_for_handicap c, not_counted_reason reason, differential::text d from player_rounds where profile_id = $1 order by source_key", [cade])).rows;
  assert.deepEqual(rows.map((r) => [r.k.slice(-2), r.c, r.reason, r.d]), [
    ["r1", true, null, "18.0"],
    ["r2", false, "Scramble isn't an own ball format", null],
    ["r3", false, "No course rating for this tee", null],
    ["r4", false, "Mixed tees need a verified composite rating", null],
    ["r5", false, "9-hole rounds will count once 9-hole scoring is added", null],
  ]);
});

test("imported rounds are ordinary profile rounds: Profile → Rounds, Stats, tournament context, privacy", async () => {
  const db = await setup();
  const desert = await course(db, "Desert Willow");
  const cade = await legacyPlayer(db, "cade-barone", "cade");
  const jake = await profile(db, "jake");
  await loggedRound(db, "cade-barone", desert, "2026-05-02", 4);
  await loggedRound(db, "cade-barone", desert, "2026-05-09", 10);
  await archivedCard(db, "cade-barone", "2026-palm-springs", 2, "Singles", 18, TEE(desert));
  await run(db, false);

  const mine = playerRoundsFromJson(await one(db, "select list_profile_rounds($1, $1) as r", [cade]));
  assert.deepEqual(mine.map((r) => r.source), ["legacy", "legacy", "legacy"]);
  const card = mine.find((r) => r.id === "legacy:maroon:2026:r2")!;
  assert.deepEqual([card.sourceLabel, card.datePlayed, card.course.name, card.holes.length, card.holes[0]], ["2026 Maroon Tournament · Round 2", "2026-04-24", "Desert Willow", 18,
    { number: 1, par: 4, strokes: 5, putts: 2, fairway: null, green: null }]);
  assert.deepEqual([card.provenance?.system, card.provenance?.seasonYear, card.provenance?.round], ["archived_scorecard_rounds", 2026, 2], "the edition context stays with the round");
  // One stats engine over every canonical round.
  assert.deepEqual(modernStats(mine), { roundsPlayed: 3, eighteenHoleRounds: 3, average18: 82.7, best18: 76, handicapIndex: 2, countingRounds: 3 });
  // Privacy as for any round: hidden while the profile is private; others never see the provenance (it names the old slot).
  assert.deepEqual(await one(db, "select list_profile_rounds($1, $2) as r", [jake, cade]), []);
  await db.query("update profiles set rounds_visibility = 'public' where id = $1", [cade]);
  const shown = await one<unknown[]>(db, "select list_profile_rounds($1, $2) as r", [jake, cade]);
  assert.equal(profileHistoryFromJson(shown).length, 3);
  assert.equal(JSON.stringify(shown).includes("cade-barone"), false);
  // Nobody else can write a 'legacy' row: it needs the import's provenance.
  await assert.rejects(db.query(`insert into player_rounds (profile_id, source, source_key, date_played, course_name, holes_played, format, total, counts_for_handicap,
    not_counted_reason, entered_by) values ($1, 'legacy', 'legacy:fake', '2026-01-01', 'X', 18, 'Singles', 80, false, 'n', 'player')`, [jake]), /player_rounds_legacy_provenance/);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select import_legacy_rounds(true)"));
  await db.exec("reset role");
});
