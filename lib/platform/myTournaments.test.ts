import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { readinessFor } from "./dashboardApi.ts";
import { summarizeManagedEditions } from "./myTournaments.ts";
import { createTournament, database, load, profile, protectedSnapshot, quick, save, sqlFile } from "./testDatabase.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** What GET /tournaments does: the database list, then the summary the page renders. */
async function raw(db: PGlite, who: string) {
  return (await db.query<{ l: unknown[] }>("select list_managed_editions($1) as l", [who])).rows[0].l;
}
const myTournaments = async (db: PGlite, who: string) => summarizeManagedEditions(await raw(db, who));
const tournamentId = async (db: PGlite, edition: string) =>
  (await db.query<{ id: string }>("select tournament_id id from tournament_editions where id = $1", [edition])).rows[0].id;
/** Access roles go in tournament_members; "player" means a claimed tournament player (playing isn't a role). */
const addMember = async (db: PGlite, edition: string, who: string, role: string) => role === "player"
  ? db.query("insert into tournament_players(tournament_id, display_name, profile_id) values ($1, 'Player', $2)", [await tournamentId(db, edition), who])
  : db.query("insert into tournament_members(tournament_id, profile_id, role) values ($1, $2, $3)", [await tournamentId(db, edition), who, role]);

test("owners and organizers see exactly the tournaments they manage; players and strangers see none", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const texas = await createTournament(db, owner, { ...quick, visibility: "private" });
    await save(db, owner, texas, "basics", { name: "Texas Cup", shortName: "Texas Cup", description: "", destination: "Horseshoe Bay, TX",
      startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: "private" });
    await save(db, owner, texas, "players", { players: [{ name: "Ann Lee", email: "ann@secret.example", handicap: 7.3 }] });

    const otherOwner = await profile(db, "other", { approved: true });
    const ozark = await createTournament(db, otherOwner, { ...quick, name: "Ozark Open", slug: "ozark-open" });
    const organizer = await profile(db, "cohost");
    await addMember(db, texas, organizer, "organizer");
    const player = await profile(db, "player");
    await addMember(db, texas, player, "player");
    const viewer = await profile(db, "viewer");
    await addMember(db, ozark, viewer, "viewer");
    const stranger = await profile(db, "stranger");

    const ownerList = await myTournaments(db, owner);
    assert.deepEqual(ownerList.map((t) => [t.slug, t.role, t.visibility]), [["texas-cup", "owner", "private"]], "private tournament shows to its owner");
    const [edition] = ownerList[0].editions;
    assert.equal(edition.year, 2027);
    assert.equal(edition.destination, "Horseshoe Bay, TX");
    assert.deepEqual([edition.startDate, edition.endDate, edition.published], ["2027-04-15", "2027-04-17", false]);
    const engine = readinessFor(await load(db, owner, texas));
    assert.deepEqual([edition.stage, edition.percent], [engine.stage, engine.percent], "the one readiness engine decides stage and percent");
    assert.ok(edition.updatedAt, "last updated");

    assert.deepEqual((await myTournaments(db, organizer)).map((t) => [t.slug, t.role]), [["texas-cup", "organizer"]]);
    assert.deepEqual((await myTournaments(db, otherOwner)).map((t) => t.slug), ["ozark-open"], "no leak between owners");
    for (const who of [player, viewer, stranger]) assert.deepEqual(await raw(db, who), [], "player/viewer/stranger: nothing");

    // The database result itself carries no emails, handicaps, player ids or entitlements.
    const json = JSON.stringify(await raw(db, owner));
    assert.ok(!json.includes("secret.example") && !json.includes("7.3"), "no emails or handicaps");
    assert.ok(!/"entitlements"/.test(json) && !/"email"/.test(json) && !/"handicap"/.test(json));
    // The summary the page renders has no ids at all.
    assert.ok(!UUID.test(JSON.stringify(ownerList)), "no internal ids in the page data");
  } finally { await db.close(); }
});

test("editions are grouped under their tournament, newest first", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const texas = await createTournament(db, owner);
    await db.query("insert into tournament_editions(tournament_id, season_year, label) values ($1, 2028, '2028')", [await tournamentId(db, texas)]);
    await createTournament(db, owner, { ...quick, name: "Ozark Open", slug: "ozark-open" });
    const list = await myTournaments(db, owner);
    assert.deepEqual(list.map((t) => t.slug).sort(), ["ozark-open", "texas-cup"]);
    assert.deepEqual(list.find((t) => t.slug === "texas-cup")!.editions.map((e) => e.year), [2028, 2027]);
  } finally { await db.close(); }
});

test("platform admins list only their own memberships; The Maroon and test years never appear; visitors can't call it", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const texas = await createTournament(db, owner);
    const admin = await profile(db, "admin", { admin: true });
    assert.deepEqual(await raw(db, admin), [], "admin: My Tournaments is membership-based, not every tournament");
    await addMember(db, texas, admin, "organizer");
    assert.deepEqual((await myTournaments(db, admin)).map((t) => t.slug), ["texas-cup"]);

    const host = await profile(db, "host", { host: true });
    await db.exec(sqlFile("platform_foundation.sql")); // makes the host an owner of The Maroon Tournament
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from tournament_members m join tournaments t on t.id = m.tournament_id where t.is_legacy and m.profile_id = $1", [host])).rows[0].n, 1);
    assert.deepEqual(await raw(db, host), [], "The Maroon is managed in the Admin Center, not listed here");
    // Even a hand-made legacy row is dropped by the summary.
    assert.deepEqual(summarizeManagedEditions([{ role: "owner", setup: { tournament: { slug: "the-maroon-tournament", isLegacy: true }, edition: { seasonYear: 2027 } } },
      { role: "player", setup: { tournament: { slug: "x" }, edition: { seasonYear: 2027 } } }, null, "junk"]), []);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select list_managed_editions($1)", [owner]), /permission denied/);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

test("My Tournaments never reads or changes live scoring", async () => {
  const db = await database();
  try {
    const before = await protectedSnapshot(db);
    const owner = await profile(db, "owner", { approved: true });
    await createTournament(db, owner);
    await myTournaments(db, owner);
    const body = (await db.query<{ d: string }>("select pg_get_functiondef('public.list_managed_editions(uuid)'::regprocedure) d")).rows[0].d;
    assert.ok(!/live_|career_|broadcast_/.test(body));
    assert.deepEqual(await protectedSnapshot(db), before);
  } finally { await db.close(); }
});
