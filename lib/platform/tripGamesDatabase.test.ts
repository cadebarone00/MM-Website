import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// REAL database tests (PGlite = Postgres in-process) for supabase/golf_trip_games.sql, after the trip + scoring SQL it
// builds on, in the order the owner runs it.

const CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_offline.sql", "golf_trip_momentum.sql", "golf_trip_games.sql"];
const TRIP = {
  tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "4", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "no", knowsTransportation: "no",
};

async function call<T = unknown>(db: PGlite, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await db.query<{ r: T }>(`select ${fn}(${params}) as r`, args.map((a) => typeof a === "object" && a !== null ? JSON.stringify(a) : a))).rows[0].r;
}
const refused = (promise: Promise<unknown>, pattern: RegExp) => assert.rejects(promise, (e: Error) => pattern.test(e.message));

type Game = { id: string; roundNumber: number; gameType: string; teams: number[] | null; started: boolean; mine: boolean; players: { profileId: string; displayName: string }[]; picks: Record<string, unknown>; pars: number[] | null };

/** Trip with Cade (organizer), Jake, Mike and Luke (accepted), one round, and a stranger who isn't on it. */
async function setup() {
  const db = await database();
  for (const file of CHAIN) await db.exec(sqlFile(file));
  await db.exec(sqlFile("golf_trip_games.sql")); // safe to run twice
  const cade = await profile(db, "cade"), jake = await profile(db, "jake"), mike = await profile(db, "mike"), luke = await profile(db, "luke"), stranger = await profile(db, "stranger");
  const parsed = golfTripPayloadFromBody({ ...TRIP, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await call<{ tripId: string }>(db, "create_golf_trip", cade, parsed.payload)).tripId;
  for (const [id, name] of [[jake, "Jake"], [mike, "Mike"], [luke, "Luke"]]) {
    await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', 'accepted')", [trip, id, name]);
  }
  const games = (who: string) => call<Game[] | null>(db, "get_trip_games", who, trip);
  const create = (who: string, game: Record<string, unknown>, request = randomUUID()) => call<Game[]>(db, "create_trip_game", who, trip, 1, game, request);
  /** Cade + Jake in group 1, Mike + Luke in group 2. */
  const groups = () => call(db, "save_trip_scoring_groups", cade, trip, 1, [
    { players: [{ profileId: cade, attesterProfileId: jake, side: null }, { profileId: jake, attesterProfileId: cade, side: null }] },
    { players: [{ profileId: mike, attesterProfileId: luke, side: null }, { profileId: luke, attesterProfileId: mike, side: null }] }]);
  return { db, trip, cade, jake, mike, luke, stranger, games, create, groups };
}

test("create a game: its players see it (with trip names), others on the trip don't, strangers get nothing", async () => {
  const { cade, jake, mike, luke, stranger, games, create } = await setup();
  const [skins] = await create(cade, { gameType: "skins", net: true, birdiesDouble: false, players: [cade, jake, mike] });
  assert.equal(skins.gameType, "skins");
  assert.equal(skins.started, true, "no teams to pick, so it starts right away");
  assert.equal(skins.mine, true);
  assert.deepEqual(skins.players.map((p) => p.displayName), ["Cade", "Jake", "Mike"]);
  assert.equal((await games(jake))?.length, 1);
  assert.equal((await games(luke))?.length, 0, "Luke isn't in it");
  assert.equal(await games(stranger), null);
});

test("your group only: once the round's groups are set, every player must be in your group", async () => {
  const { cade, jake, mike, create, groups } = await setup();
  await groups();
  await refused(create(cade, { gameType: "skins", players: [cade, mike] }), /only with players in your group/);
  const [match] = await create(cade, { gameType: "match", players: [cade, jake], teams: [0, 1] });
  assert.equal(match.started, false, "team games wait for Start");
});

test("the player count must fit the game, you must be in it, and each player once", async () => {
  const { cade, jake, mike, luke, stranger, create } = await setup();
  await refused(create(cade, { gameType: "wolf", players: [cade, jake] }), /doesn't fit 2 players/);
  await refused(create(cade, { gameType: "nines", players: [cade, jake, mike, luke] }), /doesn't fit 4 players/);
  await refused(create(cade, { gameType: "skins", players: [jake, mike] }), /have to be in a game you start/);
  await refused(create(cade, { gameType: "skins", players: [cade, cade] }), /each player once/);
  await refused(create(cade, { gameType: "skins", players: [cade, stranger] }), /aren't on this trip/);
  await refused(create(cade, { gameType: "poker", players: [cade, jake] }), /Pick a game/);
});

test("a repeated create (same request id) makes one game", async () => {
  const { cade, jake, create } = await setup();
  const request = randomUUID();
  await create(cade, { gameType: "skins", players: [cade, jake] }, request);
  assert.equal((await create(cade, { gameType: "skins", players: [cade, jake] }, request)).length, 1);
});

test("picks: the game's players save and clear them; anyone else is refused", async () => {
  const { db, cade, jake, mike, luke, create } = await setup();
  const [wolf] = await create(cade, { gameType: "wolf", players: [cade, jake, mike, luke] });
  const after = await call<Game[]>(db, "save_trip_game_pick", jake, wolf.id, 1, { wolfPartner: 2 });
  assert.deepEqual(after[0].picks, { "1": { wolfPartner: 2 } });
  const stranger = await profile(db, "nobody");
  await refused(call(db, "save_trip_game_pick", stranger, wolf.id, 1, { wolfPartner: 1 }), /Game not found/);
  await refused(call(db, "save_trip_game_pick", jake, wolf.id, 19, { wolfPartner: 1 }), /hole from 1 to 18/);
  const cleared = await call<Game[]>(db, "save_trip_game_pick", cade, wolf.id, 1, null);
  assert.deepEqual(cleared[0].picks, {});
});

test("teams change only before Start; Start begins the game; Vegas starts right away", async () => {
  const { db, cade, jake, mike, luke, create } = await setup();
  const [match] = await create(cade, { gameType: "match", players: [cade, jake, mike, luke], teams: [0, 0, 1, 1] });
  const changed = await call<Game[]>(db, "update_trip_game", jake, match.id, { teams: [0, 1, 0, 1] });
  assert.deepEqual(changed[0].teams, [0, 1, 0, 1]);
  await refused(call(db, "update_trip_game", jake, match.id, { teams: [0, 0, 0, 0] }), /each team/);
  const started = await call<Game[]>(db, "update_trip_game", mike, match.id, { started: true });
  assert.equal(started[0].started, true);
  await refused(call(db, "update_trip_game", mike, match.id, { teams: [0, 0, 1, 1] }), /set once the game starts/);
  const games = await create(cade, { gameType: "vegas", players: [cade, jake, mike, luke], teams: [0, 0, 1, 1] });
  assert.equal(games.find((g) => g.gameType === "vegas")?.started, true, "Vegas picks teams hole by hole");
});

test("only the person who started a game can remove it", async () => {
  const { db, cade, jake, games, create } = await setup();
  const [skins] = await create(cade, { gameType: "skins", players: [cade, jake] });
  await refused(call(db, "delete_trip_game", jake, skins.id), /Only the person who started/);
  assert.equal((await call<Game[]>(db, "delete_trip_game", cade, skins.id)).length, 0);
  assert.equal((await games(jake))?.length, 0);
});

test("the round's saved pars come with each game (null until the organizer sets them)", async () => {
  const { db, trip, cade, jake, create } = await setup();
  const [skins] = await create(cade, { gameType: "skins", players: [cade, jake] });
  assert.equal(skins.pars, null);
  const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  assert.equal(await call(db, "set_trip_momentum_pars", cade, trip, 1, `{${PAR.join(",")}}`), true);
  assert.deepEqual((await call<Game[]>(db, "get_trip_games", cade, trip))[0].pars, PAR);
});
