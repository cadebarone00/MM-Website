import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { createTournament, database, load, profile, quick, save, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/platform_next_edition.sql — Start next year --------------------------
// Same tournament, new edition: settings and round formats copied from the year you start from; team names only if
// asked (never who was on them, never captains); the roster is exactly the returning players the organizer picked.

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("platform_next_edition.sql"));
  await db.exec(sqlFile("platform_next_edition.sql")); // safe to run twice
  return db;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const refused = (promise: Promise<unknown>, pattern?: RegExp) => pattern ? assert.rejects(promise, pattern) : assert.rejects(promise);

/** Texas Cup 2027 (teams Blue / Gold, 2 rounds): Ann (claimed, Blue captain), Cy (unclaimed, invited), Di (Gold). */
async function cup2027(db: PGlite, owner: string) {
  const edition = await createTournament(db, owner, { ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], roundCount: 2, formats: ["Singles", "Fourball"] });
  const s = await load(db, owner, edition);
  const [blue, gold] = s.teams;
  await save(db, owner, edition, "players", { players: [
    { name: "Ann Lee", teamKey: blue.key, handicap: 7.3 }, { name: "Cy Park", teamKey: blue.key }, { name: "Di Moss", teamKey: gold.key }] });
  const players = Object.fromEntries((await load(db, owner, edition)).players.map((p) => [p.name, p.id]));
  await save(db, owner, edition, "teams", { competitionType: "teams", teams: [
    { id: blue.id, name: blue.name, color: blue.color, captainPlayerId: players["Ann Lee"] }, { id: gold.id, name: gold.name, color: gold.color, captainPlayerId: null }] });
  const tournament = (await one<string>(db, "select tournament_id as r from tournament_editions where id = $1", [edition]))!;
  const ann = await profile(db, "annlee");
  await db.query("update tournament_players set profile_id = $1, claimed_at = now() where id = $2", [ann, players["Ann Lee"]]);
  await db.query("update tournament_players set invite_token_hash = 'hash-for-cy' where id = $1", [players["Cy Park"]]);
  return { edition, tournament, ann, players };
}
const next = (db: PGlite, who: string, from: string, input: Record<string, unknown>) =>
  one<{ editionId: string; seasonYear: number; tournamentSlug: string }>(db, "select create_next_edition($1, $2, $3) as r", [who, from, JSON.stringify(input)]);
const draft = (db: PGlite, who: string, from: string) =>
  one<{ suggestedYear: number; existingYears: number[]; players: { id: string; name: string; joined: boolean; onFromRoster: boolean }[]; teams: { name: string }[] } | null>(
    db, "select get_next_edition_draft($1, $2) as r", [who, from]);
const roster = async (db: PGlite, edition: string) => (await db.query<{ name: string; team: string | null; handicap: number | null }>(`
  select p.display_name name, t.name team, r.handicap::float handicap from edition_roster r join tournament_players p on p.id = r.tournament_player_id
  left join edition_teams t on t.id = r.team_id where r.edition_id = $1 order by p.display_name`, [edition])).rows;

test("the organizer starts 2028 with the returning players they pick — same players, fresh roster rows, nothing else copied", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup2027(db, owner);
  const d = await draft(db, owner, c.edition);
  assert.equal(d?.suggestedYear, 2028);
  assert.deepEqual(d?.existingYears, [2027]);
  assert.deepEqual(d?.players.map((p) => [p.name, p.joined, p.onFromRoster]), [["Ann Lee", true, true], ["Cy Park", false, true], ["Di Moss", false, true]]);
  assert.equal(JSON.stringify(d).includes(c.ann), false, "no profile ids in the draft");
  const before = await roster(db, c.edition);

  const made = await next(db, owner, c.edition, { seasonYear: 2028, startDate: "2028-04-20", endDate: "2028-04-23", keepTeams: true, playerIds: [c.players["Ann Lee"], c.players["Cy Park"]] });
  assert.equal(made?.seasonYear, 2028);
  assert.equal(made?.tournamentSlug, "texas-cup");
  // Di skipped this year; Ann (claimed) and Cy (unclaimed) return as the SAME players: no new player rows.
  assert.equal(await one(db, "select count(*)::int as r from tournament_players where tournament_id = $1", [c.tournament]), 3);
  assert.deepEqual(await roster(db, made!.editionId), [{ name: "Ann Lee", team: null, handicap: null }, { name: "Cy Park", team: null, handicap: null }],
    "fresh rows: no team or handicap carried over");
  assert.equal(await one(db, "select profile_id as r from tournament_players where id = $1", [c.players["Ann Lee"]]), c.ann, "claimed: same profile");
  assert.equal(await one(db, "select invite_token_hash as r from tournament_players where id = $1", [c.players["Cy Park"]]), "hash-for-cy", "unclaimed: same open invite");
  // Team names kept (asked for), but no captains; settings and round formats copied; dates are the new ones.
  const s2028 = await load(db, owner, made!.editionId);
  assert.deepEqual(s2028.teams.map((t) => [t.name, t.captainPlayerId]), [["Blue", null], ["Gold", null]]);
  assert.equal(s2028.competitionType, "teams");
  assert.deepEqual(s2028.rounds.map((r) => r.format), ["Singles", "Fourball"]);
  assert.equal(s2028.edition.startDate, "2028-04-20");
  // 2027 is untouched.
  assert.deepEqual(await roster(db, c.edition), before);
  assert.equal((await load(db, owner, c.edition)).teams.find((t) => t.name === "Blue")?.captainPlayerId, c.players["Ann Lee"]);
  // New players are added the usual way afterwards and are new tournament players.
  await save(db, owner, made!.editionId, "players", { players: [
    ...s2028.players.map((p) => ({ id: p.id, name: p.name })), { name: "Eve Ward" }] });
  assert.equal(await one(db, "select count(*)::int as r from tournament_players where tournament_id = $1", [c.tournament]), 4);
});

test("no team names unless asked; an empty roster is fine (nobody is enrolled automatically)", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup2027(db, owner);
  const made = await next(db, owner, c.edition, { seasonYear: 2028, keepTeams: false, playerIds: [] });
  assert.deepEqual(await roster(db, made!.editionId), []);
  assert.deepEqual((await load(db, owner, made!.editionId)).teams, []);
});

test("one edition per year; only owners, organizers and admins; players from other tournaments and duplicates are refused", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup2027(db, owner);
  await refused(next(db, owner, c.edition, { seasonYear: 2027, playerIds: [] }), /already has 2027/);
  await refused(next(db, owner, c.edition, { seasonYear: 1999, playerIds: [] }), /year/);
  // A golfer on the roster (or a viewer) can't start a year.
  await refused(next(db, c.ann, c.edition, { seasonYear: 2028, playerIds: [] }), /organizer/);
  assert.equal(await draft(db, c.ann, c.edition), null);
  const viewer = await profile(db, "viewer");
  await db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'viewer')", [c.tournament, viewer]);
  await refused(next(db, viewer, c.edition, { seasonYear: 2028, playerIds: [] }), /organizer/);
  // Another tournament's player can't be brought in.
  const other = await createTournament(db, owner, { ...quick, name: "Desert Open", slug: "desert-open" });
  await save(db, owner, other, "players", { players: [{ name: "Zed" }] });
  const zed = (await load(db, owner, other)).players[0].id;
  await refused(next(db, owner, c.edition, { seasonYear: 2028, playerIds: [zed] }), /Unknown player/);
  assert.equal(await one(db, "select count(*)::int as r from tournament_editions where tournament_id = $1", [c.tournament]), 1, "a refused start changes nothing");
  // The same player twice is one roster row; a platform admin may start a year too.
  const admin = await profile(db, "admin", { admin: true });
  const made = await next(db, admin, c.edition, { seasonYear: 2029, playerIds: [c.players["Di Moss"], c.players["Di Moss"]] });
  assert.deepEqual((await roster(db, made!.editionId)).map((r) => r.name), ["Di Moss"]);
  // The Maroon's years are created by its own system, not here.
  const maroonEdition = await one<string>(db, "select e.id as r from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy order by e.season_year desc limit 1");
  await refused(next(db, admin, maroonEdition!, { seasonYear: 2099, playerIds: [] }), /Admin Center/);
});
