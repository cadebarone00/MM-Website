import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// REAL database tests (PGlite = Postgres in-process) for the Player & Attest scoring SQL, in the order the owner runs
// it. PGlite is one connection, so true simultaneous writes can't be raced here; ordering races (write then submit,
// submit then a late write) are covered. Supabase Realtime and the HTTP layer are not part of these tests.

const SCORING_CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql"];

export async function scoringDatabase(extra: string[] = []) {
  const db = await database();
  for (const file of [...SCORING_CHAIN, ...extra]) await db.exec(sqlFile(file));
  return db;
}

const TRIP = {
  tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "4", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "no", knowsTransportation: "no",
};

export async function call<T = unknown>(db: PGlite, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await db.query<{ r: T }>(`select ${fn}(${params}) as r`, args.map((a) => typeof a === "object" && a !== null ? JSON.stringify(a) : a))).rows[0].r;
}
export async function refused(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (e: Error) => pattern.test(e.message));
}

/** A trip with organizer Cade and members Jake + Mike (accepted), and one round. */
export async function tripWithPlayers(db: PGlite) {
  const cade = await profile(db, "cade"), jake = await profile(db, "jake"), mike = await profile(db, "mike"), stranger = await profile(db, "stranger");
  const parsed = golfTripPayloadFromBody({ ...TRIP, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  const trip = (await call<{ tripId: string }>(db, "create_golf_trip", cade, parsed.payload)).tripId;
  for (const [id, name] of [[jake, "Jake"], [mike, "Mike"]]) {
    await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, $3, 'member', 'accepted')", [trip, id, name]);
  }
  return { trip, cade, jake, mike, stranger };
}

type Scoring = { groups: { id: string; lockedAt: string | null; players: { profileId: string; attesterProfileId: string | null; submittedAt: string | null }[] }[]; entries: { scoredProfileId: string; enteredByProfileId: string; hole: number; strokes: number | null; version: number }[] };
const pair = (a: string, b: string) => ({ players: [{ profileId: a, attesterProfileId: b, side: null }, { profileId: b, attesterProfileId: a, side: null }] });
export const startScoring = (db: PGlite, who: string, trip: string, groups: unknown) => call<Scoring>(db, "save_trip_scoring_groups", who, trip, 1, groups);
const now = () => new Date().toISOString();
const op = (hole: number, strokes: number | null, extra: Record<string, unknown> = {}, base = 0) =>
  ({ opId: randomUUID(), baseVersion: base, supersedes: [], clientUpdatedAt: now(), entry: { hole, strokes, putts: 2, fairway: "center", green: "center", penaltyFairway: false, penaltyGreen: false, ...extra } });
const attestOp = (hole: number, strokes: number, base = 0) => ({ opId: randomUUID(), baseVersion: base, supersedes: [], clientUpdatedAt: now(), entry: { hole, strokes } });
export const ops = (db: PGlite, who: string, group: string, scored: string, list: unknown[]) =>
  call<{ results: { opId: string; status: string; version: number }[]; scoring: Scoring }>(db, "save_hole_score_ops", who, group, scored, list);
export const versionOf = (s: Scoring, scored: string, by: string) => s.entries.filter((e) => e.scoredProfileId === scored && (e.enteredByProfileId === scored || e.enteredByProfileId === by)).reduce((n, e) => n + e.version, 0);

/** Golfer + attester both enter all 18 holes (4s); returns the current card version. */
export async function fullMatchingCard(db: PGlite, group: string, golfer: string, attester: string) {
  await ops(db, golfer, group, golfer, Array.from({ length: 18 }, (_, i) => op(i + 1, 4)));
  const s = (await ops(db, attester, group, golfer, Array.from({ length: 18 }, (_, i) => attestOp(i + 1, 4)))).scoring;
  return versionOf(s, golfer, attester);
}
export const submit = (db: PGlite, who: string, group: string, golfer: string, version: number) =>
  call<{ status: string; reason?: string; holes?: number[]; submittedAt?: string }>(db, "submit_trip_scorecard", who, group, golfer, version);

test("scoring SQL installs in order and twice", async () => {
  const db = await scoringDatabase();
  for (const file of SCORING_CHAIN.slice(3)) await db.exec(sqlFile(file));
});

test("Step 2: groups save once; attesters must be one-to-one; once scoring starts they never change", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, stranger } = await tripWithPlayers(db);
  await refused(startScoring(db, stranger, trip, [pair(cade, jake)]), /Trip not found/);
  await refused(startScoring(db, cade, trip, [{ players: [{ profileId: cade, attesterProfileId: cade, side: null }, { profileId: jake, attesterProfileId: cade, side: null }] }]), /attests exactly one/);
  await refused(startScoring(db, cade, trip, [{ players: [{ profileId: cade, attesterProfileId: null, side: null }] }]), /at least 2 players/);
  await refused(startScoring(db, cade, trip, [pair(cade, stranger)]), /on this trip/);
  const first = await startScoring(db, cade, trip, [pair(cade, jake)]);
  const again = await startScoring(db, jake, trip, [pair(cade, jake)]);
  assert.equal(again.groups[0].id, first.groups[0].id, "same groups → nothing replaced");
  const group = first.groups[0].id;
  await ops(db, cade, group, cade, [op(1, 5)]);
  const locked = await startScoring(db, mike, trip, [{ players: [{ profileId: cade, attesterProfileId: mike, side: null }, { profileId: mike, attesterProfileId: jake, side: null }, { profileId: jake, attesterProfileId: cade, side: null }] }]);
  assert.equal(locked.groups[0].id, group, "after the first score, the saved groups come back unchanged");
  assert.ok(locked.groups[0].lockedAt);
});

test("Step 2–4: my entries and my attester's are separate rows; nobody else can write; stats are mine only", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike } = await tripWithPlayers(db);
  const group = (await startScoring(db, cade, trip, [pair(cade, jake)])).groups[0].id;
  await ops(db, cade, group, cade, [op(1, 5)]);
  const s = (await ops(db, jake, group, cade, [attestOp(1, 6)])).scoring;
  const rows = s.entries.filter((e) => e.scoredProfileId === cade && e.hole === 1).map((e) => [e.enteredByProfileId === cade ? "own" : "attester", e.strokes]);
  assert.deepEqual(rows.sort(), [["attester", 6], ["own", 5]], "two independent rows; neither overwrote the other");
  await refused(ops(db, mike, group, cade, [attestOp(1, 4)]), /Group not found/);
  await refused(ops(db, jake, group, cade, [op(2, 4)]), /strokes only/);
  const lateOld = await call<Scoring>(db, "save_hole_scores", cade, group, cade, new Date(0).toISOString(), [{ hole: 1, strokes: 9 }]);
  assert.equal(lateOld.entries.find((e) => e.scoredProfileId === cade && e.enteredByProfileId === cade && e.hole === 1)?.strokes, 5, "legacy save: an older phone write never replaces a newer one");
});

test("Step 4: ops apply once, retries are duplicates, a stale base is a conflict, my own earlier op isn't", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake } = await tripWithPlayers(db);
  const group = (await startScoring(db, cade, trip, [pair(cade, jake)])).groups[0].id;
  const first = op(1, 5);
  assert.equal((await ops(db, cade, group, cade, [first])).results[0].status, "applied");
  assert.equal((await ops(db, cade, group, cade, [first])).results[0].status, "duplicate");
  const stale = await ops(db, cade, group, cade, [op(1, 7, {}, 0)]);
  assert.equal(stale.results[0].status, "conflict", "based on version 0, but the row is at 1");
  const mine = await ops(db, cade, group, cade, [{ ...op(1, 6, {}, 0), supersedes: [first.opId] }]);
  assert.equal(mine.results[0].status, "applied", "the row's last op was my own earlier one");
  assert.equal(mine.scoring.entries.find((e) => e.scoredProfileId === cade && e.enteredByProfileId === cade && e.hole === 1)?.strokes, 6);
});

test("Step 5: submit checks completeness, attester match and version, locks the card, and is idempotent", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake } = await tripWithPlayers(db);
  const group = (await startScoring(db, cade, trip, [pair(cade, jake)])).groups[0].id;
  await ops(db, cade, group, cade, Array.from({ length: 17 }, (_, i) => op(i + 1, 4)));
  const incomplete = await submit(db, cade, group, cade, 0);
  assert.deepEqual([incomplete.status, incomplete.reason, incomplete.holes], ["rejected", "incomplete", [18]]);
  const version = await fullMatchingCard(db, group, cade, jake);
  assert.equal((await ops(db, jake, group, cade, [attestOp(5, 6, 1)])).results[0].status, "applied");
  const mismatch = await submit(db, cade, group, cade, version);
  assert.equal(mismatch.status, "rejected");
  assert.equal(mismatch.reason, "mismatch");
  assert.deepEqual(mismatch.holes, [5]);
  const fixed = (await ops(db, jake, group, cade, [attestOp(5, 4, 2)])).scoring;
  await refused(submit(db, jake, group, cade, versionOf(fixed, cade, jake)), /only submit your own card/);
  assert.equal((await submit(db, cade, group, cade, versionOf(fixed, cade, jake) - 1)).reason, "stale");
  const ok = await submit(db, cade, group, cade, versionOf(fixed, cade, jake));
  assert.equal(ok.status, "submitted");
  assert.equal((await submit(db, cade, group, cade, versionOf(fixed, cade, jake))).status, "already-submitted");
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from scorecard_submissions")).rows[0].n, 1, "a retry never adds a second submission");
  await refused(ops(db, cade, group, cade, [op(1, 3, {}, 1)]), /already submitted/);
  await refused(ops(db, jake, group, cade, [attestOp(1, 3, 1)]), /already submitted/);
  await refused(call(db, "save_hole_scores", cade, group, cade, now(), [{ hole: 1, strokes: 3 }]), /already submitted/);
  assert.equal((await ops(db, cade, group, jake, [attestOp(1, 5)])).results[0].status, "applied", "my attest column for Jake is not my card");
  const reloaded = await call<Scoring>(db, "get_trip_round_scoring", cade, trip, 1);
  assert.ok(reloaded.groups[0].players.find((p) => p.profileId === cade)?.submittedAt, "still submitted after a reload");
});
