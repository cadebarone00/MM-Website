import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripCreateFailure, golfTripPayloadFromBody, golfTripSummaries, golfTripViewer, savedTripAsDraft, splitGolfTrips, tripDateRange, tripIdFromJoinInput, type CreateGolfTripPayload, type GolfTripSummary, type SavedGolfTrip } from "./golfTripCreate.ts";
import { reviewRows } from "./golfTripDraft.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

const DRAFT = {
  requestId: "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d",
  tripName: "Maroon Masters 2027", destination: "Pinehurst, North Carolina", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com",
  golfDays: "2", day1Date: "2027-04-23", day1Rounds: "2", day2Date: "2027-04-24", day2Rounds: "1",
  round1Course: "Pinehurst No. 2", round2Course: "", round3Course: "  Pinehurst No. 4 ",
  includesTournament: "yes", knowsLodging: "no", knowsFlights: "undecided", knowsTransportation: "yes",
};

function payload(body: Record<string, string> = DRAFT): CreateGolfTripPayload {
  const result = golfTripPayloadFromBody(body);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors));
  return (result as { ok: true; payload: CreateGolfTripPayload }).payload;
}
const fields = (body: unknown) => { const r = golfTripPayloadFromBody(body); return r.ok ? [] : r.errors.map((e) => e.field); };

test("a finished questionnaire becomes one create payload", () => {
  assert.deepEqual(payload(), {
    requestId: DRAFT.requestId, name: "Maroon Masters 2027", destination: "Pinehurst, North Carolina",
    latitude: null, longitude: null, externalPlaceId: null, startDate: "2027-04-22", endDate: "2027-04-26",
    expectedTravelerCount: 8, organizer: { displayName: "Cade", email: "cade@example.com" }, golfDays: 2,
    rounds: [
      { roundNumber: 1, dayNumber: 1, playDate: "2027-04-23", courseName: "Pinehurst No. 2" },
      { roundNumber: 2, dayNumber: 1, playDate: "2027-04-23", courseName: null },
      { roundNumber: 3, dayNumber: 2, playDate: "2027-04-24", courseName: "Pinehurst No. 4" },
    ],
    includesTournament: "yes", lodgingPlan: "no", flightPlan: "undecided", transportationPlan: "yes",
  });
});

test("rejects missing, bad or mismatched answers", () => {
  assert.deepEqual(fields({ ...DRAFT, tripName: "  " }), ["tripName"]);
  assert.deepEqual(fields({ ...DRAFT, endDate: "2027-04-20" }), ["dates", "golfDays"]);
  assert.deepEqual(fields({ ...DRAFT, yourEmail: "nope" }), ["yourEmail"]);
  assert.deepEqual(fields({ ...DRAFT, golfDays: "0" }), ["golfDays"]);
  assert.deepEqual(fields({ ...DRAFT, golfDays: "6" }), ["golfDays"]);
  assert.deepEqual(fields({ ...DRAFT, day2Date: "2027-05-01" }), ["rounds"]);
  assert.deepEqual(fields({ ...DRAFT, knowsFlights: "maybe" }), ["knowsFlights"]);
  assert.deepEqual(fields({ ...DRAFT, requestId: "1" }), ["requestId"]);
  assert.deepEqual(fields({ ...DRAFT, playerCount: "0" }), ["playerCount"]);
  for (const junk of [null, 5, "x", []]) assert.deepEqual(fields(junk), ["body"]);
});

const PLACE = { destinationPlaceId: "ChIJ-bfVTh8FrIkRbkHh-dl5xIk", destinationLatitude: "35.1954", destinationLongitude: "-79.4695" };
const placeOf = (body: Record<string, string>) => { const p = payload(body); return [p.latitude, p.longitude, p.externalPlaceId]; };

test("a picked Google Places destination carries its id and coordinates; anything partial or bad is dropped, never an error", () => {
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE }), [35.1954, -79.4695, "ChIJ-bfVTh8FrIkRbkHh-dl5xIk"]);
  const none = [null, null, null];
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationPlaceId: "" }), none, "typed over: hidden answers cleared");
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationLatitude: "" }), none, "missing latitude (not read as 0)");
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationLongitude: "abc" }), none);
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationLatitude: "91" }), none, "out of range");
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationLongitude: "-180.5" }), none, "out of range");
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationPlaceId: "x".repeat(301) }), none, "id too long");
  assert.deepEqual(placeOf({ ...DRAFT, ...PLACE, destinationPlaceId: "bad id!" }), none);
});

test("database errors become plain messages", () => {
  assert.equal(golfTripCreateFailure({ code: "42501" }).status, 403);
  assert.equal(golfTripCreateFailure({ code: "22023" }).status, 400);
  assert.equal(golfTripCreateFailure({ code: "PGRST202" }).status, 503);
  assert.match(golfTripCreateFailure({ code: "XX000" }).error, /answers are still here/);
});

// --- Database: supabase/golf_trips.sql -------------------------------------------------------

async function tripsDatabase() {
  const db = await database();
  await db.exec(sqlFile("golf_trips.sql"));
  await db.exec(sqlFile("golf_trips.sql")); // safe to run twice
  return db;
}
const create = async (db: PGlite, who: string, p: CreateGolfTripPayload) =>
  (await db.query<{ r: { tripId: string; created: boolean } }>("select create_golf_trip($1, $2) as r", [who, JSON.stringify(p)])).rows[0].r;
const fetchTrip = async (db: PGlite, who: string, trip: string) =>
  (await db.query<{ r: SavedGolfTrip | null }>("select get_golf_trip($1, $2) as r", [who, trip])).rows[0].r;
const count = async (db: PGlite, table: string) => (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n;

test("create_golf_trip saves the trip, its organizer and its rounds, and reads back as the same answers", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const { tripId, created } = await create(db, cade, payload());
  assert.equal(created, true);

  const saved = await fetchTrip(db, cade, tripId);
  assert.ok(saved);
  assert.equal(saved.trip.status, "planning");
  assert.equal(saved.trip.planned_rounds, 3);
  assert.equal(saved.trip.tournament_id, null);
  assert.equal("client_request_id" in saved.trip, false);
  assert.deepEqual(saved.members.map((m) => [m.profileId, m.displayName, m.role, m.invitationStatus]), [[cade, "Cade", "organizer", "accepted"]]);
  assert.deepEqual(saved.rounds.map((r) => r.courseName), ["Pinehurst No. 2", null, "Pinehurst No. 4"]);

  // Golf Trip Home shows exactly what Review showed.
  assert.deepEqual(reviewRows(savedTripAsDraft(saved)), reviewRows({ ...DRAFT, round3Course: "Pinehurst No. 4" }));
  await db.close();
});

test("create_golf_trip saves the picked place's coordinates and id, or leaves them empty for a typed destination", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const picked = await create(db, cade, payload({ ...DRAFT, ...PLACE }));
  const typed = await create(db, cade, payload({ ...DRAFT, requestId: randomUUID() }));
  const place = (s: SavedGolfTrip | null) => [s?.trip.destination, s?.trip.latitude, s?.trip.longitude, s?.trip.external_place_id];
  assert.deepEqual(place(await fetchTrip(db, cade, picked.tripId)), ["Pinehurst, North Carolina", 35.1954, -79.4695, "ChIJ-bfVTh8FrIkRbkHh-dl5xIk"]);
  assert.deepEqual(place(await fetchTrip(db, cade, typed.tripId)), ["Pinehurst, North Carolina", null, null, null]);
  // The database refuses half a pair or impossible coordinates even if a caller skips the checks.
  await assert.rejects(create(db, cade, { ...payload(), requestId: randomUUID(), latitude: 35.2, longitude: null }), /golf_trips_coordinates_pair/);
  await assert.rejects(create(db, cade, { ...payload(), requestId: randomUUID(), latitude: 95, longitude: 10 }));
  assert.equal(await count(db, "golf_trips"), 2);
  await db.close();
});

test("a double tap or retry with the same request id returns the same trip", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const first = await create(db, cade, payload());
  const second = await create(db, cade, payload());
  assert.equal(second.tripId, first.tripId);
  assert.equal(second.created, false);
  assert.equal(await count(db, "golf_trips"), 1);
  assert.equal(await count(db, "golf_trip_rounds"), 3);
  // A new request id is a new trip.
  const third = await create(db, cade, payload({ ...DRAFT, requestId: randomUUID() }));
  assert.notEqual(third.tripId, first.tripId);
  await db.close();
});

test("a failure part-way leaves nothing behind", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const bad = { ...payload(), rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2027-05-30", courseName: null }] };
  await assert.rejects(create(db, cade, bad), /outside the trip dates/);
  const badEnum = { ...payload(), flightPlan: "maybe" } as unknown as CreateGolfTripPayload;
  await assert.rejects(create(db, cade, badEnum));
  await assert.rejects(create(db, randomUUID(), payload()), /No account found/);
  for (const table of ["golf_trips", "golf_trip_members", "golf_trip_rounds"]) assert.equal(await count(db, table), 0, table);
  await db.close();
});

test("only the trip's members can see it; nobody can write directly", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const stranger = await profile(db, "stranger");
  const { tripId } = await create(db, cade, payload());
  assert.equal(await fetchTrip(db, stranger, tripId), null);
  assert.equal(await fetchTrip(db, cade, randomUUID()), null);

  const as = async (role: "authenticated" | "anon", who: string | null, sql: string, params: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ?? ""]);
    await db.query(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.query("reset role"); }
  };
  assert.equal((await as("authenticated", cade, "select id from golf_trips")).rows.length, 1);
  assert.equal((await as("authenticated", cade, "select id from golf_trip_rounds")).rows.length, 3);
  assert.equal((await as("authenticated", stranger, "select id from golf_trips")).rows.length, 0);
  // Members' rows (emails, invitations) are never readable directly, not even by the trip's own members.
  await assert.rejects(as("authenticated", stranger, "select id from golf_trip_members"));
  await assert.rejects(as("authenticated", cade, "select email from golf_trip_members"));
  await assert.rejects(as("anon", null, "select id from golf_trips"));
  await assert.rejects(as("authenticated", stranger, "insert into golf_trip_members(golf_trip_id, profile_id, display_name) values ($1, $2, 'me')", [tripId, stranger]));
  await assert.rejects(as("authenticated", cade, "update golf_trips set name = 'x'"));
  await assert.rejects(as("authenticated", cade, "select create_golf_trip($1, $2)", [cade, JSON.stringify(payload({ ...DRAFT, requestId: randomUUID() }))]));
  await assert.rejects(as("authenticated", stranger, "select get_golf_trip($1, $2)", [cade, tripId]));
  await db.close();
});

const listTrips = async (db: PGlite, who: string) =>
  golfTripSummaries((await db.query<{ r: unknown }>("select list_my_golf_trips($1) as r", [who])).rows[0].r);

test("each person's trips list holds only the trips they're on, with their role, soonest first", async () => {
  const db = await tripsDatabase();
  const cade = await profile(db, "cade");
  const drew = await profile(db, "drew");
  const stranger = await profile(db, "stranger");
  const later = await create(db, cade, payload());
  const sooner = await create(db, cade, payload({ ...DRAFT, requestId: randomUUID(), tripName: "Spring Warmup", startDate: "2027-03-05", endDate: "2027-03-07",
    golfDays: "1", day1Date: "2027-03-05", day1Rounds: "1", day2Date: "", day2Rounds: "", playerCount: "" }));
  // Drew joins Cade's Pinehurst trip as a member (invitations aren't built; this is what one will do).
  await db.query("insert into golf_trip_members(golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Drew', 'member', 'accepted')", [later.tripId, drew]);

  const mine: GolfTripSummary[] = await listTrips(db, cade);
  assert.deepEqual(mine.map((t) => [t.id, t.name, t.role, t.startDate, t.endDate]), [
    [sooner.tripId, "Spring Warmup", "organizer", "2027-03-05", "2027-03-07"],
    [later.tripId, "Maroon Masters 2027", "organizer", "2027-04-22", "2027-04-26"],
  ]);
  assert.deepEqual(mine.map((t) => [t.destination, t.expectedTravelerCount, t.memberCount, t.status]),
    [["Pinehurst, North Carolina", null, 1, "planning"], ["Pinehurst, North Carolina", 8, 2, "planning"]]);
  assert.deepEqual((await listTrips(db, drew)).map((t) => [t.id, t.role]), [[later.tripId, "member"]]);
  assert.deepEqual(await listTrips(db, stranger), []);
  await db.query("set role authenticated");
  await assert.rejects(db.query("select list_my_golf_trips($1)", [cade]), /permission denied/);
  await db.query("reset role");

  // The trip page knows who is the organizer and who is a member.
  const saved = (await fetchTrip(db, drew, later.tripId))!;
  assert.deepEqual(golfTripViewer(saved, cade), { profileId: cade, memberId: saved.members[0].id, role: "organizer", isOrganizer: true });
  assert.deepEqual(golfTripViewer(saved, drew), { profileId: drew, memberId: saved.members[1].id, role: "member", isOrganizer: false });
  assert.equal(golfTripViewer(saved, stranger), null);
  await db.close();
});

test("golfTripSummaries drops anything malformed", () => {
  assert.deepEqual(golfTripSummaries(null), []);
  assert.deepEqual(golfTripSummaries([null, { id: 1 }, { id: "a", name: "x", role: "boss" }]), []);
  assert.equal(golfTripSummaries([{ id: "a", name: "x", role: "member" }]).length, 1);
});

test("My Trips splits upcoming from past and reads dates like a calendar", () => {
  const trip = (id: string, startDate: string, endDate: string): GolfTripSummary =>
    ({ id, name: id, destination: "x", startDate, endDate, status: "planning", expectedTravelerCount: null, memberCount: 1, role: "organizer" });
  const trips = [trip("old", "2026-03-01", "2026-03-03"), trip("older-end", "2026-05-01", "2026-05-02"), trip("now", "2026-09-30", "2026-10-02"), trip("next", "2027-04-22", "2027-04-26")];
  const { upcoming, past } = splitGolfTrips(trips, "2026-10-01");
  assert.deepEqual(upcoming.map((t) => t.id), ["now", "next"]);
  assert.deepEqual(past.map((t) => t.id), ["older-end", "old"]);

  assert.equal(tripDateRange("2027-04-22", "2027-04-26"), "Apr 22 – 26, 2027");
  assert.equal(tripDateRange("2027-04-28", "2027-05-02"), "Apr 28 – May 2, 2027");
  assert.equal(tripDateRange("2027-12-30", "2028-01-02"), "Dec 30, 2027 – Jan 2, 2028");
  assert.equal(tripDateRange("2027-04-22", "2027-04-22"), "Apr 22, 2027");
  assert.equal(tripDateRange("", "2027-04-22"), "");
});

test("Join a Trip reads the trip id from a pasted Trip ID or trip link", () => {
  const id = "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
  assert.equal(tripIdFromJoinInput(id), id);
  assert.equal(tripIdFromJoinInput(`  ${id.toUpperCase()} `), id);
  assert.equal(tripIdFromJoinInput(`https://themaroon.com/golf-trips/${id}`), id);
  assert.equal(tripIdFromJoinInput(`https://themaroon.com/golf-trips/${id}/settings?x=1`), id);
  assert.equal(tripIdFromJoinInput(""), null);
  assert.equal(tripIdFromJoinInput("not a trip"), null);
  assert.equal(tripIdFromJoinInput("https://themaroon.com/golf-trips/new"), null);
  assert.equal(tripIdFromJoinInput(`https://themaroon.com/golf-trips/${id}extra`), null);
});
