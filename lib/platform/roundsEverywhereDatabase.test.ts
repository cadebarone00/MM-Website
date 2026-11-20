import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";
import { tripScoringFromJson } from "./tripScoring.ts";

// REAL database tests (PGlite) for supabase/rounds_everywhere.sql: rounds from Tourneys, Leagues and Golf Trips reach
// Profile → Rounds (player_rounds), counting toward the handicap when they qualify. Local only; nothing touches Supabase.

const TRIP_CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql", "golf_trip_scoring_corrections.sql",
  "golf_trip_momentum.sql", "golf_trip_round_pars.sql", "tournament_codes.sql", "leagues.sql"];
const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const COURSE = { ref: "og-1", name: "Test GC", place: "Dallas, TX", par: PARS, strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1) };
const TEE = { name: "Blue", rating: 70.1, slope: 120 };
/** (72 − 70.1) × 113 ÷ 120 = 1.79 → 1.8 */
const DIFF_72 = 1.8;

async function call<T = unknown>(db: PGlite, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(", ");
  const value = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "number") ? `{${a.join(",")}}` : typeof a === "object" && a !== null ? JSON.stringify(a) : a;
  return (await db.query<{ r: T }>(`select ${fn}(${params}) as r`, args.map(value))).rows[0].r;
}
type Row = { source: string; source_key: string; total: number; counts_for_handicap: boolean; differential: string | null; not_counted_reason: string | null; tee_rating: string | null; course_name: string };
const rounds = async (db: PGlite, who: string) => (await db.query<Row>("select * from player_rounds where profile_id = $1 order by source_key", [who])).rows;

async function setup(withFile = true) {
  const db = await database();
  for (const file of TRIP_CHAIN) await db.exec(sqlFile(file));
  if (withFile) { await db.exec(sqlFile("rounds_everywhere.sql")); await db.exec(sqlFile("rounds_everywhere.sql")); } // safe to run twice
  const [a, b, c] = [await profile(db, "amy"), await profile(db, "ben"), await profile(db, "cal")];
  return { db, a, b, c };
}

async function tourney(db: PGlite, organizer: string, players: string[], tee: unknown = TEE) {
  const t = await call<{ id: string; code: string }>(db, "create_code_tournament", organizer, "Club Champ", "Gross", true, null, [{ setup: { course: COURSE, tee }, date: "2026-11-01" }]);
  for (const p of players) if (p !== organizer) await call(db, "join_code_tournament", p, t.code, 10);
  return t;
}
async function playTourney(db: PGlite, id: string, who: string, strokes = 4) {
  for (let hole = 1; hole <= 18; hole++) await call(db, "set_code_tournament_strokes", who, id, 1, hole, strokes);
  await call(db, "submit_code_tournament_card", who, id, 1);
}

test("tourney: a submitted 18-hole card with a rated tee reaches the profile and counts; saved once; kept after delete", async () => {
  const { db, a, b } = await setup();
  const t = await tourney(db, a, [a, b]);
  await playTourney(db, t.id, b);
  const [row] = await rounds(db, b);
  assert.deepEqual([row.source, row.source_key, row.total, row.counts_for_handicap, Number(row.differential), row.course_name], ["tourney", `tourney:${t.id}:1`, 72, true, DIFF_72, "Test GC"]);
  assert.deepEqual(await rounds(db, a), [], "the organizer hasn't submitted");
  // Saving the same round again changes nothing; deleting the tourney keeps the round on the profile.
  await call(db, "publish_round_quietly", b, await call(db, "tourney_round_for_profile", t.id, 1, b));
  assert.equal((await rounds(db, b)).length, 1);
  await db.query("delete from code_tournaments where id = $1", [t.id]);
  assert.equal((await rounds(db, b)).length, 1, "the round outlives the tourney");
  db.close();
});

test("tourney: no rating for the tee → saved to the profile with the reason, not counted", async () => {
  const { db, a } = await setup();
  const t = await tourney(db, a, [a], null);
  await playTourney(db, t.id, a, 5);
  const [row] = await rounds(db, a);
  assert.deepEqual([row.source, row.total, row.counts_for_handicap, row.differential, row.not_counted_reason], ["tourney", 90, false, null, "No course rating for this tee"]);
  db.close();
});

test("league: when the scorer submits the group card, every player in the group gets the round and it counts", async () => {
  const { db, a, b, c } = await setup();
  const made = await call<{ id: string; code: string }>(db, "create_league", a, "Thursday", { ...COURSE, tee: TEE }, "2026-11-12", "Gross", true, 5);
  for (const p of [b, c]) await call(db, "join_league", p, made.code, 12);
  await call(db, "set_league_groups", a, made.id, [{ time: "08:00", hole: 1, scorer: a, players: [a, b] }, { time: "08:10", hole: 1, scorer: c, players: [c] }]);
  for (const [p, s] of [[a, 4], [b, 5]] as const) for (let hole = 1; hole <= 18; hole++) await call(db, "set_league_strokes", a, made.id, p, hole, s);
  assert.deepEqual(await rounds(db, a), [], "nothing before the card is submitted");
  await call(db, "submit_league_group", a, made.id, 1);
  const [ra] = await rounds(db, a), [rb] = await rounds(db, b);
  assert.deepEqual([ra.source, ra.source_key, ra.total, ra.counts_for_handicap, Number(ra.differential)], ["league", `league:${made.id}`, 72, true, DIFF_72]);
  assert.deepEqual([rb.total, rb.counts_for_handicap, Number(rb.differential)], [90, true, Math.round((90 - 70.1) * 113 / 120 * 10) / 10]);
  assert.deepEqual(await rounds(db, c), [], "the other group hasn't submitted");
  db.close();
});

test("trip: a card counts once the organizer confirmed pars from the course with one tee's rating; changing the course clears it", async () => {
  const { db, a, b, c } = await setup();
  const parsed = golfTripPayloadFromBody({ requestId: randomUUID(), tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "3", yourName: "Amy", yourEmail: "amy@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "Pinehurst No. 2",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "no", knowsTransportation: "no" }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await call<{ tripId: string }>(db, "create_golf_trip", a, parsed.payload)).tripId;
  for (const [id, name] of [[b, "Ben"], [c, "Cal"]]) await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', 'accepted')", [trip, id, name]);
  // Only the organizer, only course pars, only a real rating.
  assert.equal(await call(db, "confirm_trip_round_pars", a, trip, 1, PARS, "manual", null, "Pinehurst No. 2", null), true);
  assert.equal(await call(db, "set_trip_round_tee_rating", a, trip, 1, 70.1, 120), false, "hand-typed pars have no rating");
  assert.equal(await call(db, "confirm_trip_round_pars", a, trip, 1, PARS, "course", "og-1", "Pinehurst No. 2", "Blue"), true);
  assert.equal(await call(db, "set_trip_round_tee_rating", b, trip, 1, 70.1, 120), false, "not the organizer");
  assert.equal(await call(db, "set_trip_round_tee_rating", a, trip, 1, 70.1, 30), false, "slope out of range");
  assert.equal(await call(db, "set_trip_round_tee_rating", a, trip, 1, 70.1, 120), true);
  // Ben's card: 18 fours, attested by Cal, submitted → his profile round counts.
  const group = tripScoringFromJson(await call(db, "save_trip_scoring_groups", a, trip, 1, [{ players: [
    { profileId: a, attesterProfileId: b, side: null }, { profileId: b, attesterProfileId: c, side: null }, { profileId: c, attesterProfileId: a, side: null }] }]))!.groups[0].id;
  const all = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, strokes: 4 }));
  await call(db, "save_hole_scores", b, group, b, new Date().toISOString(), all.map((h) => ({ ...h, putts: 2, fairway: "center", green: "center", penaltyFairway: false, penaltyGreen: false })));
  await call(db, "save_hole_scores", c, group, b, new Date().toISOString(), all);
  const card = tripScoringFromJson(await call(db, "get_trip_round_scoring", b, trip, 1))!;
  const version = card.entries.filter((e) => e.scoredProfileId === b).reduce((n, e) => n + e.version, 0);
  const submitted = await call<{ status: string }>(db, "submit_trip_scorecard", b, group, b, version);
  assert.equal(submitted.status, "submitted", JSON.stringify(submitted));
  const [row] = await rounds(db, b);
  assert.deepEqual([row.source, row.total, row.counts_for_handicap, Number(row.differential), Number(row.tee_rating)], ["trip", 72, true, DIFF_72, 70.1]);
  // A different tee (or course, or pars) clears the saved rating.
  await db.query("update golf_trip_rounds set par_tee = 'White' where golf_trip_id = $1", [trip]);
  assert.equal((await db.query<{ r: string | null }>("select par_tee_rating r from golf_trip_rounds where golf_trip_id = $1", [trip])).rows[0].r, null);
  db.close();
});

test("rounds submitted before the file are saved once when it runs; a round that can't be saved never blocks a card", async () => {
  const { db, a, b } = await setup(false);
  const t = await tourney(db, a, [a, b]);
  await playTourney(db, t.id, b);
  assert.deepEqual(await rounds(db, b), [], "before the file: tourney rounds don't reach the profile");
  await db.exec(sqlFile("rounds_everywhere.sql"));
  await db.exec(sqlFile("rounds_everywhere.sql"));
  const saved = await rounds(db, b);
  assert.deepEqual(saved.map((r) => [r.source, r.counts_for_handicap]), [["tourney", true]], "backfilled once");
  // A round the profile refuses (a total that doesn't match its holes) is logged, not raised.
  const broken = { ...(await call<Record<string, unknown>>(db, "tourney_round_for_profile", t.id, 1, b)), sourceKey: `tourney:${t.id}:9`, total: 1 };
  await call(db, "publish_round_quietly", b, broken);
  assert.equal((await rounds(db, b)).length, 1);
  db.close();
});
