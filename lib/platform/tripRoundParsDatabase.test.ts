import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";
import { tripScoringFromJson } from "./tripScoring.ts";

// REAL database tests (PGlite) for H5C Part 1: supabase/golf_trip_round_pars.sql on top of the trip scoring + momentum
// chain, in the order the owner would run it. Local only; nothing here touches Supabase.

const CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql", "golf_trip_scoring_corrections.sql",
  "golf_trip_momentum.sql"];
const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];

async function call<T = unknown>(db: PGlite, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(", ");
  const value = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "number") ? `{${a.join(",")}}` : typeof a === "object" && a !== null ? JSON.stringify(a) : a;
  return (await db.query<{ r: T }>(`select ${fn}(${params}) as r`, args.map(value))).rows[0].r;
}

async function setup(withPars = true) {
  const db = await database();
  for (const file of CHAIN) await db.exec(sqlFile(file));
  if (withPars) await db.exec(sqlFile("golf_trip_round_pars.sql"));
  const cade = await profile(db, "cade"), jake = await profile(db, "jake"), mike = await profile(db, "mike"), stranger = await profile(db, "stranger");
  const parsed = golfTripPayloadFromBody({ requestId: randomUUID(), tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "3", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "Pinehurst No. 2",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "no", knowsTransportation: "no" }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await call<{ tripId: string }>(db, "create_golf_trip", cade, parsed.payload)).tripId;
  for (const [id, name] of [[jake, "Jake"], [mike, "Mike"]]) {
    await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', 'accepted')", [trip, id, name]);
  }
  return { db, trip, cade, jake, mike, stranger };
}
const confirm = (db: PGlite, who: string, trip: string, pars: number[], source = "course", ref: string | null = "og-1", tee: string | null = "Blue") =>
  call<boolean>(db, "confirm_trip_round_pars", who, trip, 1, pars, source, ref, "Pinehurst No. 2", tee);
const scoring = async (db: PGlite, who: string, trip: string) => tripScoringFromJson(await call(db, "get_trip_round_scoring", who, trip, 1))!;
const groups = (a: string, b: string, c: string) => [{ players: [
  { profileId: a, attesterProfileId: b, side: null }, { profileId: b, attesterProfileId: c, side: null }, { profileId: c, attesterProfileId: a, side: null }] }];

test("round pars: installs twice, organizer-only confirm, strict pars, read back with scoring as a confirmed snapshot", async () => {
  const { db, trip, cade, jake, stranger } = await setup();
  await db.exec(sqlFile("golf_trip_round_pars.sql")); // safe to run again
  assert.equal((await scoring(db, cade, trip)).pars, null, "no pars yet: null, never a default");
  assert.equal(await confirm(db, jake, trip, PARS), false, "a member who isn't the organizer");
  assert.equal(await confirm(db, stranger, trip, PARS), false, "someone not on the trip");
  assert.equal(await confirm(db, cade, trip, PARS.slice(0, 17)), false, "17 holes");
  assert.equal(await confirm(db, cade, trip, PARS.map((p, i) => (i === 3 ? 7 : p))), false, "a par 7");
  assert.equal(await confirm(db, cade, trip, PARS.map((p, i) => (i === 3 ? 2 : p))), false, "a par 2");
  assert.equal(await confirm(db, cade, trip, PARS, "course", null), false, "course pars need the course ref");
  assert.equal(await confirm(db, cade, trip, PARS, "guess"), false, "unknown source");
  assert.equal(await confirm(db, cade, trip, PARS), true);
  const saved = (await scoring(db, jake, trip)).pars!;
  assert.deepEqual({ ...saved, confirmedAt: Boolean(saved.confirmedAt) }, {
    pars: PARS, source: "course", courseRef: "og-1", courseName: "Pinehurst No. 2", tee: "Blue", confirmedBy: "Cade", confirmedAt: true, lockedAt: null });
  assert.equal(await call(db, "get_trip_round_scoring", stranger, trip, 1), null, "strangers see nothing");
  // Manual pars replace them (before tee-off) and drop the course link.
  assert.equal(await confirm(db, cade, trip, PARS.map((p, i) => (i === 1 ? 4 : p)), "manual", null, null), true);
  const manual = (await scoring(db, cade, trip)).pars!;
  assert.equal(manual.source, "manual"); assert.equal(manual.courseRef, null); assert.equal(manual.pars[1], 4);
  db.close();
});

test("round pars lock at the first score; starting holes are organizer-only and fixed once the group scores", async () => {
  const { db, trip, cade, jake, mike } = await setup();
  assert.equal(await confirm(db, cade, trip, PARS), true);
  const s = tripScoringFromJson(await call(db, "save_trip_scoring_groups", cade, trip, 1, groups(cade, jake, mike)))!;
  const group = s.groups[0].id;
  assert.equal(s.groups[0].startHole, 1, "a normal start by default");
  assert.equal(await call(db, "set_trip_group_start_hole", jake, trip, group, 10), false, "only the organizer");
  assert.equal(await call(db, "set_trip_group_start_hole", cade, trip, group, 19), false, "hole 19");
  assert.equal(await call(db, "set_trip_group_start_hole", cade, randomUUID(), group, 10), false, "another trip's id");
  assert.equal(await call(db, "set_trip_group_start_hole", cade, trip, group, 10), true);
  assert.equal((await scoring(db, jake, trip)).groups[0].startHole, 10);
  await call(db, "save_hole_scores", jake, group, jake, new Date().toISOString(), [{ hole: 10, strokes: 4 }]);
  assert.equal(await confirm(db, cade, trip, PARS.map(() => 4), "manual", null, null), false, "pars locked after the first score");
  assert.equal(await call(db, "set_trip_group_start_hole", cade, trip, group, 1), false, "start hole fixed once the group has a score");
  const after = await scoring(db, cade, trip);
  assert.deepEqual(after.pars!.pars, PARS);
  assert.ok(after.pars!.lockedAt, "lockedAt = the round's first score");
  assert.equal(after.groups[0].startHole, 10);
  db.close();
});

test("a new course before scoring clears the old course's pars; the old pars screen still works and is labelled manual", async () => {
  const { db, trip, cade } = await setup();
  assert.equal(await call(db, "set_trip_momentum_pars", cade, trip, 1, PARS), true, "Notifications → round pars keeps working");
  const legacy = (await scoring(db, cade, trip)).pars!;
  assert.equal(legacy.source, "manual"); assert.equal(legacy.confirmedBy, "Cade");
  await db.query("update golf_trip_rounds set course_name = course_name where golf_trip_id = $1", [trip]);
  assert.ok((await scoring(db, cade, trip)).pars, "same course: pars stay");
  await db.query("update golf_trip_rounds set course_name = 'Pine Needles' where golf_trip_id = $1", [trip]);
  assert.equal((await scoring(db, cade, trip)).pars, null, "another course: the old pars no longer apply");
  db.close();
});

test("installing on a database that already has typed pars labels them manual; scoring JSON is unchanged without the file", async () => {
  const { db, trip, cade } = await setup(false);
  assert.equal(await call(db, "set_trip_momentum_pars", cade, trip, 1, PARS), true);
  const before = await call<Record<string, unknown>>(db, "get_trip_round_scoring", cade, trip, 1);
  assert.ok(!("pars" in before), "before the file: no pars key (the app treats it as not installed)");
  assert.equal(tripScoringFromJson(before)!.pars, undefined);
  await db.exec(sqlFile("golf_trip_round_pars.sql"));
  const after = (await scoring(db, cade, trip)).pars!;
  assert.deepEqual([after.source, after.pars], ["manual", PARS]);
  db.close();
});

test("momentum birdie alerts read the confirmed pars exactly as before", async () => {
  const { db, trip, cade, jake, mike } = await setup();
  assert.equal(await confirm(db, cade, trip, PARS), true);
  const group = tripScoringFromJson(await call(db, "save_trip_scoring_groups", cade, trip, 1, groups(cade, jake, mike)))!.groups[0].id;
  // Jake birdies 1–2 (pars 4, 5), attested by Mike: the existing trigger fires birdie_2 off the same pars column.
  for (const hole of [1, 2]) {
    await call(db, "save_hole_scores", jake, group, jake, new Date().toISOString(), [{ hole, strokes: PARS[hole - 1] - 1 }]);
    await call(db, "save_hole_scores", mike, group, jake, new Date().toISOString(), [{ hole, strokes: PARS[hole - 1] - 1 }]);
  }
  assert.deepEqual((await db.query<{ cause: string }>("select cause from trip_momentum_events where cause like 'birdie_%'")).rows.map((r) => r.cause), ["birdie_2"]);
  db.close();
});

test("a published trip round carries each hole's confirmed par (profile history and trip stats)", async () => {
  const { db, trip, cade, jake, mike } = await setup();
  assert.equal(await confirm(db, cade, trip, PARS), true);
  const group = tripScoringFromJson(await call(db, "save_trip_scoring_groups", cade, trip, 1, groups(cade, jake, mike)))!.groups[0].id;
  const all = (strokes: number) => Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, strokes }));
  await call(db, "save_hole_scores", jake, group, jake, new Date().toISOString(), all(4).map((h) => ({ ...h, putts: 2, fairway: "center", green: "center", penaltyFairway: false, penaltyGreen: false })));
  await call(db, "save_hole_scores", mike, group, jake, new Date().toISOString(), all(4));
  const card = await scoring(db, jake, trip);
  const version = card.entries.filter((e) => e.scoredProfileId === jake).reduce((n, e) => n + e.version, 0);
  const submitted = await call<{ status: string }>(db, "submit_trip_scorecard", jake, group, jake, version);
  assert.equal(submitted.status, "submitted", JSON.stringify(submitted));
  const row = await db.query<{ r: { holes: { number: number; par: number | null; strokes: number }[] } }>("select trip_submission_round(s) r from scorecard_submissions s where golfer_profile_id = $1", [jake]);
  assert.deepEqual(row.rows[0].r.holes.map((h) => h.par), PARS);
  assert.deepEqual(row.rows[0].r.holes.map((h) => h.strokes), Array(18).fill(4), "strokes unchanged");
  db.close();
});
