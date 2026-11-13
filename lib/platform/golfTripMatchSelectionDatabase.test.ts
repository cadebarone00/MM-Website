import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/golf_trip_match_selection.sql -------------------------------------------
// Safe storage for saved Match Selection: version checks, organizer starts, members only, unique players, final once done.

const TRIP = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "4", yourName: "Org", yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "yes", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
async function setup() {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_setup.sql", "golf_trip_match_selection.sql", "golf_trip_match_selection.sql"]) await db.exec(sqlFile(file));
  const org = await profile(db, "org");
  const p = golfTripPayloadFromBody({ ...TRIP, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [org, JSON.stringify(p.payload)])).rows[0].r.tripId;
  const add = async (name: string) => { const id = await profile(db, name); await db.query("insert into golf_trip_members(golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', 'accepted')", [trip, id, name]); return id; };
  const [a1, b1, b2] = [await add("a1"), await add("b1"), await add("b2")];
  const outsider = await profile(db, "outsider");
  await db.query("insert into golf_trip_setup(golf_trip_id, settings, basis, revision, last_write_id) values ($1, '{}', '{}', 1, $2)", [trip, randomUUID()]);
  return { db, trip, org, a1, b1, b2, outsider };
}
const call = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const read = (db: PGlite, who: string, trip: string) => call<{ version: number; state: unknown; completedAt: string | null } | null>(db, "select get_golf_trip_match_selection($1, $2, '1-0') as r", [who, trip]);
const save = (db: PGlite, who: string, trip: string, version: number, spots: { profileId: string }[], results: unknown = null, type = "Response") =>
  call<{ version: number }>(db, "select save_golf_trip_match_selection($1, $2, '1-0', $3, $4, $5, $6) as r", [who, trip, version, type, JSON.stringify({ startedAt: "t", spots }), results === null ? null : JSON.stringify(results)]);

test("members read; outsiders get nothing; only the organizer starts a round", async () => {
  const { db, trip, org, a1, outsider } = await setup();
  assert.deepEqual(await read(db, a1, trip), { version: 0, state: null, completedAt: null });
  assert.equal(await read(db, outsider, trip), null);
  await assert.rejects(save(db, a1, trip, 0, []), /Only the organizer can start/);
  assert.equal((await save(db, org, trip, 0, [])).version, 1);
  assert.equal((await read(db, a1, trip))!.version, 1);
});

test("two saves from the same version: the second is refused (no overwriting each other)", async () => {
  const { db, trip, org, a1, b1 } = await setup();
  await save(db, org, trip, 0, []);
  assert.equal((await save(db, a1, trip, 1, [{ profileId: a1 }])).version, 2);
  await assert.rejects(save(db, b1, trip, 1, [{ profileId: b1 }]), /Someone else just changed this round/);
});

test("only accepted members can be placed, each once; outsiders can't save", async () => {
  const { db, trip, org, a1, outsider } = await setup();
  await save(db, org, trip, 0, []);
  await assert.rejects(save(db, org, trip, 1, [{ profileId: outsider }]), /only trip members/);
  await assert.rejects(save(db, org, trip, 1, [{ profileId: a1 }, { profileId: a1 }]), /placed once/);
  await assert.rejects(save(db, outsider, trip, 1, []), /Trip not found/);
  await assert.rejects(save(db, org, trip, 1, [], null, "Ranks"), /Invalid match selection/, "the type can't change mid-round");
});

test("finishing saves the matches with the round, marks it done, and nothing can change after", async () => {
  const { db, trip, org, a1, b1 } = await setup();
  await save(db, org, trip, 0, []);
  await save(db, a1, trip, 1, [{ profileId: a1 }, { profileId: b1 }], [{ a: [1], b: [2] }]);
  assert.ok((await read(db, a1, trip))!.completedAt);
  const settings = (await db.query<{ s: { matchSelectionResults: unknown; completedMatchDrafts: unknown } }>("select settings as s from golf_trip_setup where golf_trip_id = $1", [trip])).rows[0].s;
  assert.deepEqual(settings.matchSelectionResults, { "1-0": [{ a: [1], b: [2] }] });
  assert.deepEqual(settings.completedMatchDrafts, ["1-0"]);
  await assert.rejects(save(db, org, trip, 2, []), /already set/);
});

test("the browser can't read picks — only the version numbers, for Realtime", async () => {
  const { db, trip, org, a1 } = await setup();
  await save(db, org, trip, 0, [{ profileId: a1 }]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a1]);
  await assert.rejects(db.query("select * from golf_trip_match_selection"), /permission denied/);
  assert.deepEqual((await db.query<{ version: number }>("select version from golf_trip_match_selection_versions")).rows.map(r => r.version), [1]);
  await assert.rejects(db.query("select save_golf_trip_match_selection($1, $2, '1-0', 1, 'Response', '{}', null)", [a1, trip]), /permission denied/);
  await db.exec("reset role");
  const published = (await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'golf_trip_match%'")).rows.map(r => r.tablename);
  assert.deepEqual(published, ["golf_trip_match_selection_versions"], "only the version table is broadcast");
});
