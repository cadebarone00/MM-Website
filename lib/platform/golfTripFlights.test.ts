import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { flightCounts, flightInputFromBody, flightsFromRows, flightSummary, flightTime, golfTripFlightFailure, groupFlights, isLocalDateTime, type FlightInput, type GolfTripFlight } from "./golfTripFlights.ts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

const FORM = {
  direction: "arrival", airline: " American Airlines ", flightNumber: "aa 1234", departureAirport: "dfw", arrivalAirport: "rdu",
  departureLocal: "2027-04-22T07:05", arrivalLocal: "2027-04-22T11:10", confirmationNumber: "abc-123", notes: "  Window seat ",
};
const input = (body: Record<string, unknown> = FORM): FlightInput => {
  const r = flightInputFromBody(body);
  assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.errors));
  return (r as { ok: true; flight: FlightInput }).flight;
};
const fields = (body: unknown) => { const r = flightInputFromBody(body); return r.ok ? [] : r.errors.map((e) => e.field); };

test("the flight form is tidied into one save payload", () => {
  assert.deepEqual(input(), {
    id: null, direction: "arrival", airline: "American Airlines", flightNumber: "AA1234", departureAirport: "DFW", arrivalAirport: "RDU",
    departureLocal: "2027-04-22T07:05", arrivalLocal: "2027-04-22T11:10", confirmationNumber: "ABC123", notes: "Window seat",
  });
  assert.deepEqual([input({ ...FORM, confirmationNumber: " ", notes: "" }).confirmationNumber, input({ ...FORM, notes: "" }).notes], [null, null]);
  // Westbound: lands "before" it leaves in local times. Allowed.
  assert.equal(input({ ...FORM, departureLocal: "2027-04-22T10:00", arrivalLocal: "2027-04-22T09:30" }).arrivalLocal, "2027-04-22T09:30");
});

test("bad or missing flight details are refused with the field to fix", () => {
  assert.deepEqual(fields({ ...FORM, direction: "sideways" }), ["direction"]);
  assert.deepEqual(fields({ ...FORM, airline: "" }), ["airline"]);
  assert.deepEqual(fields({ ...FORM, airline: "x".repeat(61) }), ["airline"]);
  assert.deepEqual(fields({ ...FORM, flightNumber: "--" }), ["flightNumber"]);
  assert.deepEqual(fields({ ...FORM, flightNumber: "AA12345678" }), ["flightNumber"]);
  assert.deepEqual(fields({ ...FORM, departureAirport: "Dallas" }), ["departureAirport"]);
  assert.deepEqual(fields({ ...FORM, arrivalAirport: "dfw" }), ["arrivalAirport"]);
  assert.deepEqual(fields({ ...FORM, departureLocal: "2027-02-30T07:05" }), ["departureLocal"]);
  assert.deepEqual(fields({ ...FORM, arrivalLocal: "" }), ["arrivalLocal"]);
  assert.deepEqual(fields({ ...FORM, confirmationNumber: "x".repeat(13) }), ["confirmationNumber"]);
  assert.deepEqual(fields({ ...FORM, notes: "x".repeat(501) }), ["notes"]);
  assert.deepEqual(fields({ ...FORM, id: "nope" }), ["id"]);
  for (const junk of [null, "x", [], 4]) assert.deepEqual(fields(junk), ["body"]);
  assert.equal(isLocalDateTime("2027-04-22T24:00"), false);
  assert.equal(isLocalDateTime("2028-02-29T00:00"), true);
});

const flight = (id: string, direction: "arrival" | "return", departs: string): GolfTripFlight => ({
  id, direction, airline: "AA", flightNumber: id, departureAirport: "DFW", arrivalAirport: "RDU", departureLocal: departs, arrivalLocal: departs,
  confirmationNumber: null, notes: null, source: "manual", liveStatus: null, departureTerminal: null, departureGate: null, arrivalTerminal: null, arrivalGate: null,
});

test("flights group into Getting There / Heading Home in departure order, and the card shows the next one", () => {
  const list = [flight("R1", "return", "2027-04-26T13:00"), flight("A2", "arrival", "2027-04-22T10:00"), flight("A1", "arrival", "2027-04-22T06:00")];
  const groups = groupFlights(list);
  assert.deepEqual([groups.arrival.map((f) => f.id), groups.return.map((f) => f.id)], [["A1", "A2"], ["R1"]]);
  const before = flightSummary(list, "2027-04-01");
  assert.deepEqual([before.next?.id, before.arrivalCount, before.returnCount, flightCounts(before)], ["A1", 2, 1, "2 getting there · 1 heading home"]);
  assert.equal(flightSummary(list, "2027-04-23").next?.id, "R1");
  assert.equal(flightSummary(list, "2027-05-01").next, null);
  assert.equal(flightCounts(flightSummary([], "2027-04-01")), "");
  assert.equal(flightTime("2027-04-22T07:05"), "Apr 22, 7:05 AM");
  assert.equal(flightTime("2027-04-22T00:30"), "Apr 22, 12:30 AM");
  assert.equal(flightTime("2027-12-01T13:00"), "Dec 1, 1:00 PM");
});

test("database errors become plain messages", () => {
  assert.equal(golfTripFlightFailure({ code: "P0002" }).status, 404);
  assert.match(golfTripFlightFailure({ code: "22023", message: "You can save up to 20 flights per trip." }).error, /20 flights/);
  assert.equal(golfTripFlightFailure({ code: "23514" }).status, 400);
  assert.equal(golfTripFlightFailure({ code: "PGRST202" }).status, 503);
  assert.equal(golfTripFlightFailure({ code: "XX000" }).status, 500);
});

// --- Database: supabase/golf_trip_flights.sql -------------------------------------------------

const TRIP_DRAFT = {
  requestId: "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};

async function flightsDatabase() {
  const db = await database();
  await db.exec(sqlFile("golf_trips.sql"));
  await db.exec(sqlFile("golf_trip_flights.sql"));
  await db.exec(sqlFile("golf_trip_flights.sql")); // safe to run twice
  return db;
}
async function makeTrip(db: PGlite, who: string) {
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  return (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [who, JSON.stringify(p.payload)])).rows[0].r.tripId;
}
const save = async (db: PGlite, who: string, trip: string, f: FlightInput) =>
  flightsFromRows([(await db.query<{ r: unknown }>("select save_golf_trip_flight($1, $2, $3) as r", [who, trip, JSON.stringify(f)])).rows[0].r])[0];
const list = async (db: PGlite, who: string, trip: string) =>
  (await db.query<{ r: unknown }>("select list_my_golf_trip_flights($1, $2) as r", [who, trip])).rows[0].r;
const remove = async (db: PGlite, who: string, trip: string, id: string) =>
  (await db.query<{ r: boolean }>("select delete_golf_trip_flight($1, $2, $3) as r", [who, trip, id])).rows[0].r;
const count = async (db: PGlite) => (await db.query<{ n: number }>("select count(*)::int n from golf_trip_flights")).rows[0].n;

test("a member adds, edits and deletes their own flights; they read back the same, in departure order", async () => {
  const db = await flightsDatabase();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const out = await save(db, cade, trip, input());
  const home = await save(db, cade, trip, input({ ...FORM, direction: "return", departureAirport: "RDU", arrivalAirport: "DFW", departureLocal: "2027-04-26T15:00", arrivalLocal: "2027-04-26T17:30", confirmationNumber: "", notes: "" }));
  const first = await save(db, cade, trip, input({ ...FORM, flightNumber: "AA1", departureLocal: "2027-04-22T05:00", arrivalLocal: "2027-04-22T06:00", arrivalAirport: "ORD" }));
  assert.deepEqual({ ...out, id: "" }, { id: "", direction: "arrival", airline: "American Airlines", flightNumber: "AA1234", departureAirport: "DFW", arrivalAirport: "RDU",
    departureLocal: "2027-04-22T07:05", arrivalLocal: "2027-04-22T11:10", confirmationNumber: "ABC123", notes: "Window seat", source: "manual",
    liveStatus: null, departureTerminal: null, departureGate: null, arrivalTerminal: null, arrivalGate: null });
  assert.deepEqual(flightsFromRows(await list(db, cade, trip)).map((f) => f.id), [first.id, out.id, home.id]);

  const edited = await save(db, cade, trip, { ...input({ ...FORM, airline: "Delta", flightNumber: "DL55" }), id: out.id });
  assert.deepEqual([edited.id, edited.airline, edited.flightNumber], [out.id, "Delta", "DL55"]);
  assert.equal(await count(db), 3);

  assert.equal(await remove(db, cade, trip, home.id), true);
  assert.equal(await remove(db, cade, trip, home.id), false, "already gone");
  assert.equal(await count(db), 2);
  await db.close();
});

test("flights are private: a stranger or another member can't read, edit or delete them", async () => {
  const db = await flightsDatabase();
  const cade = await profile(db, "cade");
  const friend = await profile(db, "friend");
  const trip = await makeTrip(db, cade);
  const friendsTrip = await makeTrip(db, friend);
  const mine = await save(db, cade, trip, input());

  assert.equal(await list(db, friend, trip), null, "not on the trip");
  await assert.rejects(save(db, friend, trip, input()), /Trip not found/);
  assert.equal(await remove(db, friend, trip, mine.id), false);
  // Even on their own trip, they can't reach my flight by id.
  await assert.rejects(save(db, friend, friendsTrip, { ...input(), id: mine.id }), /Flight not found/);
  assert.equal(await remove(db, friend, friendsTrip, mine.id), false);
  assert.deepEqual(await list(db, friend, friendsTrip), []);
  assert.equal(await count(db), 1);

  // Direct table access: own rows only, no writes at all.
  const as = async (who: string | null, role: "authenticated" | "anon", sql: string) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ?? ""]);
    await db.query(`set role ${role}`);
    try { return await db.query(sql); } finally { await db.query("reset role"); }
  };
  assert.equal((await as(cade, "authenticated", "select id from golf_trip_flights")).rows.length, 1);
  assert.equal((await as(friend, "authenticated", "select id from golf_trip_flights")).rows.length, 0);
  await assert.rejects(as(null, "anon", "select id from golf_trip_flights"));
  await assert.rejects(as(cade, "authenticated", `delete from golf_trip_flights`));
  await assert.rejects(as(cade, "authenticated", `select list_my_golf_trip_flights('${cade}', '${trip}')`));
  await db.close();
});

test("the database repeats the important checks, caps flights at 20, and never writes provider fields", async () => {
  const db = await flightsDatabase();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const raw = (f: Record<string, unknown>) => db.query("select save_golf_trip_flight($1, $2, $3)", [cade, trip, JSON.stringify({ ...input(), ...f })]);
  await assert.rejects(raw({ departureAirport: "dallas" }));
  await assert.rejects(raw({ arrivalAirport: "DFW" }), /check/);
  await assert.rejects(raw({ flightNumber: "aa-1" }));
  await assert.rejects(raw({ direction: "sideways" }));
  await assert.rejects(raw({ departureLocal: "not a time" }));
  // A caller trying to set provider fields is ignored: they stay manual and empty.
  await raw({ source: "provider", provider: "x", liveStatus: "On time", departure_gate: "B12" });
  const [saved] = flightsFromRows(await list(db, cade, trip));
  assert.deepEqual([saved.source, saved.liveStatus, saved.departureGate], ["manual", null, null]);
  const providerColumns = (await db.query<{ n: number }>("select count(*)::int n from golf_trip_flights where provider is null and provider_flight_id is null and last_synced_at is null")).rows[0].n;
  assert.equal(providerColumns, 1);

  for (let i = 1; i < 20; i++) await save(db, cade, trip, input());
  await assert.rejects(save(db, cade, trip, input()), /up to 20 flights/);
  assert.equal(await count(db), 20);
  await db.close();
});

test("deleting the trip removes its flights (trip-owned data)", async () => {
  const db = await flightsDatabase();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await save(db, cade, trip, input());
  assert.equal((await db.query<{ r: boolean }>("select delete_golf_trip($1, $2) as r", [cade, trip])).rows[0].r, true);
  assert.equal(await count(db), 0);
  await db.close();
});
