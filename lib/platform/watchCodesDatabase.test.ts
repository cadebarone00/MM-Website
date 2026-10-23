import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/watch_codes.sql (read-only codes for tournaments and trips) ----------------------------

const TRIP_DRAFT = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
const round = { setup: { course: { ref: "c1", name: "Pine Valley", place: "", par: Array(18).fill(4) }, tee: null }, date: "2026-11-01" };

async function setup() {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "tournament_codes.sql"]) await db.exec(sqlFile(file));
  const cam = await profile(db, "cam");
  // A tournament and a trip made before watch codes existed get one when the file runs.
  const before = (await db.query<{ r: { id: string; code: string } }>("select create_code_tournament($1, 'Old', 'Gross', true, null, $2) as r", [cam, JSON.stringify([round])])).rows[0].r;
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [cam, JSON.stringify(p.payload)])).rows[0].r.tripId;
  await db.exec(sqlFile("watch_codes.sql"));
  await db.exec(sqlFile("watch_codes.sql")); // safe to run twice
  return { db, cam, before, trip };
}
const watchOf = async (db: Awaited<ReturnType<typeof setup>>["db"], table: string, id: string) =>
  (await db.query<{ w: string }>(`select watch_code w from ${table} where id = $1`, [id])).rows[0].w;
const find = async (db: Awaited<ReturnType<typeof setup>>["db"], code: string) =>
  (await db.query<{ r: { kind: string; id: string; organizer: string } | null }>("select find_watch_code($1) as r", [code])).rows[0].r;

test("old and new tournaments and trips all get a W watch code that differs from every join code", async () => {
  const { db, cam, before, trip } = await setup();
  const made = (await db.query<{ r: { id: string; code: string } }>("select create_code_tournament($1, 'New', 'Gross', true, null, $2) as r", [cam, JSON.stringify([round])])).rows[0].r;
  const codes = [await watchOf(db, "code_tournaments", before.id), await watchOf(db, "code_tournaments", made.id), await watchOf(db, "golf_trips", trip)];
  for (const code of codes) assert.match(code, /^W[A-HJKMNP-Z2-9]{5}$/);
  assert.equal(new Set(codes).size, 3);
  assert.ok(!codes.includes(before.code) && !codes.includes(made.code));
  assert.notEqual(made.code[0], "W", "join codes never start with W");
});

test("a watch code finds its tournament or trip and the organizer (typed any way); a join code or junk finds nothing", async () => {
  const { db, cam, before, trip } = await setup();
  const t = await watchOf(db, "code_tournaments", before.id), g = await watchOf(db, "golf_trips", trip);
  assert.deepEqual(await find(db, `${t.slice(0, 3).toLowerCase()}-${t.slice(3)}`), { kind: "tournament", id: before.id, organizer: cam });
  assert.deepEqual(await find(db, g), { kind: "trip", id: trip, organizer: cam });
  assert.equal(await find(db, before.code), null);
  assert.equal(await find(db, "WZZZZZ"), null);
});
