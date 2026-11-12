import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/golf_trip_team_draft.sql ------------------------------------------------
// Saved, final Team Draft picks: organizer starts, captain on the clock (or organizer) picks, the last pick saves the teams.

const TRIP = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Org", yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "yes", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};

type Draft = { startedAt: string | null; completedAt: string | null; picks: { pickNumber: number; profileId: string; team: number; pickedBy: string }[] };

async function setup() {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_setup.sql", "golf_trip_team_draft.sql", "golf_trip_team_draft.sql"]) await db.exec(sqlFile(file)); // last: safe to run twice
  const org = await profile(db, "org");
  const p = golfTripPayloadFromBody({ ...TRIP, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [org, JSON.stringify(p.payload)])).rows[0].r.tripId;
  const add = async (name: string, status = "accepted") => {
    const id = await profile(db, name);
    await db.query("insert into golf_trip_members(golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', $4)", [trip, id, name, status]);
    return id;
  };
  const [capA, capB, p1, p2, p3] = [await add("capA"), await add("capB"), await add("p1"), await add("p2"), await add("p3")];
  const pending = await add("pending", "pending");
  const outsider = await profile(db, "outsider");
  await db.query("insert into golf_trip_setup(golf_trip_id, settings, basis, revision, last_write_id) values ($1, $2, '{}', 1, $3)",
    [trip, JSON.stringify({ teamSelection: "Draft", draftCaptains: { 0: capA, 1: capB } }), randomUUID()]);
  return { db, trip, org, capA, capB, p1, p2, p3, pending, outsider };
}

const call = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const read = (db: PGlite, who: string, trip: string) => call<Draft | null>(db, "select get_golf_trip_team_draft($1, $2) as r", [who, trip]);
const start = (db: PGlite, who: string, trip: string) => call<Draft>(db, "select start_golf_trip_team_draft($1, $2) as r", [who, trip]);
const pick = (db: PGlite, who: string, trip: string, n: number, player: string, team: number) =>
  call<Draft>(db, "select make_golf_trip_team_draft_pick($1, $2, $3, $4, $5, 2) as r", [who, trip, n, player, team]);
const refused = async (promise: Promise<unknown>, message: RegExp) => { await assert.rejects(promise, message); };

test("members can read the draft; outsiders and pending invitees get nothing", async () => {
  const { db, trip, p1, outsider, pending } = await setup();
  assert.deepEqual(await read(db, p1, trip), { startedAt: null, completedAt: null, picks: [] });
  assert.equal(await read(db, outsider, trip), null);
  assert.equal(await read(db, pending, trip), null);
});

test("only the organizer starts the draft; nobody can pick before it starts; starting twice keeps the first time", async () => {
  const { db, trip, org, capA, p1 } = await setup();
  await refused(pick(db, capA, trip, 1, p1, 0), /hasn't started/);
  await refused(start(db, capA, trip), /Only the organizer/);
  const first = (await start(db, org, trip)).startedAt;
  assert.ok(first);
  assert.equal((await start(db, org, trip)).startedAt, first);
});

test("the captain of the team on the clock picks; another captain can't pick for them; the organizer can", async () => {
  const { db, trip, org, capA, capB, p1, p2 } = await setup();
  await start(db, org, trip);
  await refused(pick(db, capB, trip, 1, p1, 0), /not your pick/);
  const after = await pick(db, capA, trip, 1, p1, 0);
  assert.deepEqual(after.picks.map(p => [p.pickNumber, p.profileId, p.team, p.pickedBy]), [[1, p1, 0, capA]]);
  const byOrganizer = await pick(db, org, trip, 2, p2, 1);
  assert.equal(byOrganizer.picks[1].pickedBy, org);
});

test("double picks are refused: same pick number twice, a picked player, a captain, a non-member", async () => {
  const { db, trip, org, capA, capB, p1, p2, pending, outsider } = await setup();
  await start(db, org, trip);
  await pick(db, capA, trip, 1, p1, 0);
  await refused(pick(db, capB, trip, 1, p2, 1), /already made/);             // someone tapped at the same time
  await refused(pick(db, capB, trip, 2, p1, 1), /already on a team/);        // p1 is taken
  await refused(pick(db, capB, trip, 2, capA, 1), /already on a team/);      // captains are already placed
  await refused(pick(db, capB, trip, 2, pending, 1), /already on a team/);   // not an accepted member
  await refused(pick(db, outsider, trip, 2, p2, 1), /Trip not found/);
  await refused(pick(db, capB, trip, 2, p2, 5), /Invalid team/);
  assert.equal((await read(db, org, trip))!.picks.length, 1, "nothing else was saved");
});

test("picks can't be changed afterwards: the app has no update/delete path, and finishing saves the teams once", async () => {
  const { db, trip, org, capA, capB, p1, p2, p3 } = await setup();
  await start(db, org, trip);
  await pick(db, capA, trip, 1, p1, 0);
  await pick(db, capB, trip, 2, p2, 1);
  await pick(db, capB, trip, 3, p3, 1);
  const done = await call<Draft>(db, "select complete_golf_trip_team_draft($1, $2, $3) as r", [capB, trip, JSON.stringify([[1, 3], [2, 4, 5]])]);
  assert.ok(done.completedAt);
  const saved = (await db.query<{ settings: { submittedTeams: number[][]; draftCaptains: unknown }; revision: number }>("select settings, revision from golf_trip_setup where golf_trip_id = $1", [trip])).rows[0];
  assert.deepEqual(saved.settings.submittedTeams, [[1, 3], [2, 4, 5]]);
  assert.ok(saved.settings.draftCaptains, "the rest of the setup is kept");
  assert.equal(saved.revision, 2, "open Settings screens see a newer revision");
  await refused(pick(db, org, trip, 4, p1, 0), /draft is over/);
  const again = await call<Draft>(db, "select complete_golf_trip_team_draft($1, $2, $3) as r", [org, trip, JSON.stringify([[9]])]);
  assert.equal(again.completedAt, done.completedAt);
  assert.deepEqual((await db.query<{ t: unknown }>("select settings->'submittedTeams' as t from golf_trip_setup where golf_trip_id = $1", [trip])).rows[0].t, [[1, 3], [2, 4, 5]], "finishing twice doesn't overwrite");
});

test("the browser can't touch the tables directly; members may only read (for Realtime)", async () => {
  const { db, trip, p1 } = await setup();
  await db.exec("set role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [p1]);
  await refused(db.query("insert into golf_trip_team_draft_picks(golf_trip_id, pick_number, profile_id, team_index) values ($1, 1, $2, 0)", [trip, p1]), /permission denied/);
  await refused(db.query("select make_golf_trip_team_draft_pick($1, $2, 1, $1, 0, 2)", [p1, trip]), /permission denied/);
  assert.equal((await db.query("select * from golf_trip_team_draft_picks")).rows.length, 0);
  await db.exec("reset role");
  const published = (await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'golf_trip_team_draft%' order by 1")).rows.map(r => r.tablename);
  assert.deepEqual(published, ["golf_trip_team_draft", "golf_trip_team_draft_picks"]);
});
