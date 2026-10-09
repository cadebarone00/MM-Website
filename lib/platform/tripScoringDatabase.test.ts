import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// REAL database tests (PGlite = Postgres in-process) for the Player & Attest scoring SQL, in the order the owner runs
// it. PGlite is one connection, so true simultaneous writes can't be raced here; ordering races (write then submit,
// submit then a late write) are covered. Supabase Realtime and the HTTP layer are not part of these tests.

const SCORING_CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "golf_trip_scoring_corrections.sql"];

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
  // Number lists are Postgres arrays (integer[]); other objects / lists are JSON.
  const value = (a: unknown) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === "number") ? `{${a.join(",")}}` : Array.isArray(a) && a.length === 0 && fn === "request_scorecard_correction" ? "{}" : typeof a === "object" && a !== null ? JSON.stringify(a) : a;
  return (await db.query<{ r: T }>(`select ${fn}(${params}) as r`, args.map(value))).rows[0].r;
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

// --- Step 6: corrections, reopening, history (supabase/golf_trip_scoring_corrections.sql) ---

type Request = { id: string; status: string; holes: number[]; revision: number };
const request = (db: PGlite, who: string, group: string, golfer: string, holes: number[], reason: string) =>
  call<{ status: string; request: Request }>(db, "request_scorecard_correction", who, group, golfer, holes, reason);
const decide = (db: PGlite, who: string, id: string, approve: boolean, note: string | null = null) =>
  call<{ status: string; request: Request }>(db, "decide_scorecard_correction", who, id, approve, note);
const history = (db: PGlite, who: string, trip: string) =>
  call<{ isOrganizer: boolean; requests: Request[]; revisions: { golferProfileId: string; revision: number; submittedByName: string; correctionRequestId: string | null }[] }>(db, "get_scorecard_corrections", who, trip, 1);
const queued = (hole: number, strokes: number, base: number, stats = true) => ({ opId: randomUUID(), baseVersion: base, supersedes: [], clientUpdatedAt: new Date().toISOString(),
  entry: stats ? { hole, strokes, putts: 2, fairway: "center", green: "center" } : { hole, strokes } });

/** Jake and Mike attest each other; Jake's card is complete, matching and submitted (revision 1). Cade organizes. */
async function submittedCard(db: PGlite) {
  const t = await tripWithPlayers(db);
  const group = (await startScoring(db, t.cade, t.trip, [pair(t.jake, t.mike)])).groups[0].id;
  const version = await fullMatchingCard(db, group, t.jake, t.mike);
  assert.equal((await submit(db, t.jake, group, t.jake, version)).status, "submitted");
  return { ...t, group };
}

test("Step 6: only the golfer requests, only for a submitted card, with holes and a reason; duplicates return the open one", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  await refused(request(db, mike, group, jake, [3], "Wrong score"), /own card/);
  await refused(request(db, cade, group, jake, [3], "Wrong score"), /Group not found/);
  await refused(request(db, jake, group, jake, [], "Wrong score"), /Pick the holes/);
  await refused(request(db, jake, group, jake, [3, 3], "Wrong score"), /Pick the holes/);
  await refused(request(db, jake, group, jake, [19], "Wrong score"), /Pick the holes/);
  await refused(request(db, jake, group, jake, [3], "  "), /Say why/);
  await refused(request(db, mike, group, mike, [3], "Mine too"), /Only a submitted card/);
  const first = await request(db, jake, group, jake, [7, 3], "Hole 3 was a 5, hole 7 a 4");
  assert.equal(first.status, "requested");
  assert.deepEqual(first.request.holes, [3, 7]);
  assert.equal(first.request.revision, 1);
  const again = await request(db, jake, group, jake, [9], "Again");
  assert.deepEqual([again.status, again.request.id], ["duplicate", first.request.id]);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from scorecard_correction_requests")).rows[0].n, 1);
  const seen = await history(db, mike, trip);
  assert.equal(seen.isOrganizer, false);
  assert.equal(seen.requests.length, 1);
});

test("Step 6: only the organizer decides; pending and denied never unlock the card; deciding twice keeps the first decision", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  const req = (await request(db, jake, group, jake, [3], "Wrong score")).request;
  await refused(ops(db, jake, group, jake, [queued(3, 5, 1)]), /already submitted/);
  await refused(decide(db, jake, req.id, true), /decide your own/);
  await refused(decide(db, mike, req.id, true), /Only the trip organizer/);
  const denied = await decide(db, cade, req.id, false, "Scores were right");
  assert.equal(denied.status, "denied");
  assert.equal((await decide(db, cade, req.id, true)).status, "already-decided");
  await refused(ops(db, jake, group, jake, [queued(3, 5, 1)]), /already submitted/);
  const after = await call<Scoring>(db, "get_trip_round_scoring", jake, trip, 1);
  assert.ok(after.groups[0].players.find((p) => p.profileId === jake)?.submittedAt, "denied: still locked");
  assert.equal((await request(db, jake, group, jake, [3], "Asking again")).status, "requested", "a new request is allowed after a denial");
});

test("Step 6: approval reopens only that golfer; stale offline changes conflict; resubmission re-verifies and adds a revision", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  // Mike submits too, so we can see approval leaves his card alone.
  const mikeVersion = await fullMatchingCard(db, group, mike, jake);
  assert.equal((await submit(db, mike, group, mike, mikeVersion)).status, "submitted");
  const queuedBeforeLock = queued(3, 9, 1);
  const req = (await request(db, jake, group, jake, [3], "Hole 3 was a 5")).request;
  assert.equal((await decide(db, cade, req.id, true, "OK")).status, "approved");
  const reopened = await call<Scoring>(db, "get_trip_round_scoring", jake, trip, 1);
  const player = (id: string) => reopened.groups[0].players.find((p) => p.profileId === id);
  assert.equal(player(jake)?.submittedAt, null, "Jake's card reopened");
  assert.ok(player(mike)?.submittedAt, "Mike's card stays submitted");
  const hole3 = (by: string) => reopened.entries.find((e) => e.scoredProfileId === jake && e.enteredByProfileId === by && e.hole === 3);
  assert.deepEqual([hole3(jake)?.strokes, hole3(jake)?.version], [4, 2], "Jake's own score unchanged, version bumped");
  assert.deepEqual([hole3(mike)?.strokes, hole3(mike)?.version], [null, 2], "the attester's old hole 3 is cleared: it must be attested again");
  // A change queued on a phone before the lock (based on version 1) can't silently apply now.
  assert.equal((await ops(db, jake, group, jake, [queuedBeforeLock])).results[0].status, "conflict");
  // The correction: Jake changes hole 3 to 5; his attester first says 6 (mismatch), then 5.
  assert.equal((await ops(db, jake, group, jake, [queued(3, 5, 2)])).results[0].status, "applied");
  let s = (await ops(db, mike, group, jake, [queued(3, 6, 2, false)])).scoring;
  const mismatch = await submit(db, jake, group, jake, versionOf(s, jake, mike));
  assert.deepEqual([mismatch.status, mismatch.reason, mismatch.holes], ["rejected", "mismatch", [3]], "full re-verification against the attester");
  s = (await ops(db, mike, group, jake, [queued(3, 5, 3, false)])).scoring;
  assert.equal((await submit(db, jake, group, jake, versionOf(s, jake, mike) - 1)).reason, "stale");
  assert.equal((await submit(db, jake, group, jake, versionOf(s, jake, mike))).status, "submitted");
  const log = await history(db, cade, trip);
  assert.equal(log.isOrganizer, true);
  assert.deepEqual(log.revisions.filter((r) => r.golferProfileId === jake).map((r) => [r.revision, r.submittedByName, r.correctionRequestId]), [[1, "Jake", null], [2, "Jake", req.id]]);
  assert.equal(log.requests.find((r) => r.id === req.id)?.status, "resubmitted");
  const current = (await db.query<{ revision: number; strokes: number }>("select revision, (card->2->>'strokes')::int strokes from scorecard_submissions where golfer_profile_id = $1", [jake])).rows[0];
  assert.deepEqual(current, { revision: 2, strokes: 5 }, "the new revision is current");
  const original = (await db.query<{ strokes: number }>("select (card->2->>'strokes')::int strokes from scorecard_submission_revisions where golfer_profile_id = $1 and revision = 1", [jake])).rows[0];
  assert.equal(original.strokes, 4, "revision 1 still shows the original 4");
  await refused(ops(db, jake, group, jake, [queued(3, 7, 3)]), /already submitted/);
  assert.equal((await submit(db, jake, group, jake, versionOf(s, jake, mike))).status, "already-submitted");
});

test("Step 6: submission history can't be edited or deleted directly; refreshes keep every state; deleting the trip still cascades", async () => {
  const db = await scoringDatabase();
  const { trip, jake, group } = await submittedCard(db);
  await refused(db.query("update scorecard_submission_revisions set card_version = 0"), /can.t be changed/);
  await refused(db.query("delete from scorecard_submission_revisions"), /can.t be changed/);
  await request(db, jake, group, jake, [1], "Typo");
  const reloaded = await history(db, jake, trip);
  assert.deepEqual([reloaded.requests[0].status, reloaded.revisions.length], ["pending", 1]);
  await db.query("delete from golf_trips where id = $1", [trip]);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from scorecard_submission_revisions")).rows[0].n, 0);
});

test("Step 6: running the corrections file again over existing submissions keeps exactly one revision 1", async () => {
  const db = await scoringDatabase();
  const { jake, group } = await submittedCard(db);
  await db.exec(sqlFile("golf_trip_scoring_corrections.sql"));
  const rows = (await db.query<{ revision: number }>("select revision from scorecard_submission_revisions where group_id = $1 and golfer_profile_id = $2", [group, jake])).rows;
  assert.deepEqual(rows.map((r) => r.revision), [1]);
});

// --- Step 6 fixes: fresh attestation, approved holes only, no self-approval ---

const entry = (s: Scoring, scored: string, by: string, hole: number) => s.entries.find((e) => e.scoredProfileId === scored && e.enteredByProfileId === by && e.hole === hole);
const stampOf = async (db: PGlite, scored: string, by: string, hole: number) =>
  (await db.query<{ id: string | null }>("select correction_request_id id from hole_score_entries where scored_profile_id = $1 and entered_by_profile_id = $2 and hole = $3", [scored, by, hole])).rows[0].id;

test("Step 6 fix 1: approval clears the old attestation on the approved holes; resubmission needs a fresh one for this request", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  const attesterQueuedBeforeLock = queued(3, 4, 1, false);
  const req = (await request(db, jake, group, jake, [3, 7], "Hole 3 was a 5")).request;
  await decide(db, cade, req.id, true);
  let s = await call<Scoring>(db, "get_trip_round_scoring", jake, trip, 1);
  assert.deepEqual([entry(s, jake, mike, 3)?.strokes, entry(s, jake, mike, 7)?.strokes, entry(s, jake, mike, 8)?.strokes], [null, null, 4], "approved holes cleared; unaffected holes keep their verified value");
  const now1 = await submit(db, jake, group, jake, versionOf(s, jake, mike));
  assert.deepEqual([now1.status, now1.reason, now1.holes], ["rejected", "mismatch", [3, 7]], "can't resubmit straight away");
  // The attester's stale offline change from before the lock can't count as the new attestation.
  assert.equal((await ops(db, mike, group, jake, [attesterQueuedBeforeLock])).results[0].status, "conflict");
  assert.equal((await ops(db, jake, group, jake, [queued(3, 5, 2)])).results[0].status, "applied");
  s = (await ops(db, mike, group, jake, [queued(3, 5, 2, false)])).scoring;
  assert.equal(await stampOf(db, jake, mike, 3), req.id, "the attester's new entry is recorded for this request");
  assert.equal(await stampOf(db, jake, jake, 3), null, "the golfer's own entry is never an attestation");
  const still = await submit(db, jake, group, jake, versionOf(s, jake, mike));
  assert.deepEqual([still.reason, still.holes], ["mismatch", [7]], "hole 7 still needs the attester");
  // Re-entering the SAME number (4) on hole 7 is a new attestation event for this request: it counts.
  s = (await ops(db, mike, group, jake, [queued(7, 4, 2, false)])).scoring;
  assert.equal(await stampOf(db, jake, mike, 7), req.id);
  assert.equal((await submit(db, jake, group, jake, versionOf(s, jake, mike))).status, "submitted");
  // After resubmission the stamp can't be cleared or moved by a direct write.
  await db.query("update hole_score_entries set correction_request_id = null where scored_profile_id = $1 and hole = 3", [jake]);
  assert.equal(await stampOf(db, jake, mike, 3), req.id);
  const rev1 = (await db.query<{ a: number }>("select (card->6->>'attestStrokes')::int a from scorecard_submission_revisions where golfer_profile_id = $1 and revision = 1", [jake])).rows[0];
  assert.equal(rev1.a, 4, "revision 1 still records the original attestation");
});

test("Step 6 fix 1: a matching number left over without a new attestation event for this request doesn't count", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  const req = (await request(db, jake, group, jake, [7], "Check hole 7")).request;
  await decide(db, cade, req.id, true);
  // Simulate the old number reappearing without going through any save path (no stamp).
  await db.query("alter table hole_score_entries disable trigger hole_score_entries_correction_guard");
  await db.query("update hole_score_entries set strokes = 4 where scored_profile_id = $1 and entered_by_profile_id = $2 and hole = 7", [jake, mike]);
  await db.query("alter table hole_score_entries enable trigger hole_score_entries_correction_guard");
  const s = await call<Scoring>(db, "get_trip_round_scoring", jake, trip, 1);
  const r = await submit(db, jake, group, jake, versionOf(s, jake, mike));
  assert.deepEqual([r.status, r.reason, r.holes], ["rejected", "mismatch", [7]], "the numbers match, but no fresh attestation was recorded");
});

test("Step 6 fix 2: only the approved holes can change, for the golfer and the attester, on every save path", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, group } = await submittedCard(db);
  const golferQueuedBeforeLock = queued(5, 9, 1);
  const req = (await request(db, jake, group, jake, [3], "Hole 3")).request;
  await decide(db, cade, req.id, true);
  // One batch: the approved hole applies, the locked one is answered "locked" and changes nothing.
  const batch = await ops(db, jake, group, jake, [queued(3, 5, 2), queued(5, 3, 1)]);
  assert.deepEqual(batch.results.map((r) => r.status), ["applied", "locked"]);
  assert.equal(entry(batch.scoring, jake, jake, 5)?.strokes, 4);
  assert.equal((await ops(db, jake, group, jake, [golferQueuedBeforeLock])).results[0].status, "locked", "a stale offline change to a locked hole stays refused after the reopen");
  assert.equal((await ops(db, mike, group, jake, [queued(5, 3, 1, false)])).results[0].status, "locked", "the attester can't touch it either");
  // The older save path has no versions: refused outright for a card under correction.
  await refused(call(db, "save_hole_scores", jake, group, jake, now(), [{ hole: 3, strokes: 6 }]), /being corrected/);
  await refused(call(db, "save_hole_scores", mike, group, jake, now(), [{ hole: 5, strokes: 6 }]), /being corrected/);
  // The database itself (trigger) refuses any other write to a locked hole, whatever the path.
  await refused(db.query("update hole_score_entries set strokes = 9 where scored_profile_id = $1 and entered_by_profile_id = $1 and hole = 5", [jake]), /approved correction/);
  await refused(db.query("update hole_score_entries set hole = 3 where scored_profile_id = $1 and entered_by_profile_id = $1 and hole = 5", [jake]), /approved correction/);
  // Other golfers' cards aren't affected: Jake still attests Mike's (unsubmitted) card on any hole.
  assert.equal((await ops(db, jake, group, mike, [queued(5, 3, 0, false)])).results[0].status, "applied");
  // Finish: the locked holes are exactly as submitted in the new revision.
  const s = (await ops(db, mike, group, jake, [queued(3, 5, 2, false)])).scoring;
  assert.equal((await submit(db, jake, group, jake, versionOf(s, jake, mike))).status, "submitted");
  const card = (await db.query<{ c: { hole: number; strokes: number }[] }>("select card c from scorecard_submissions where golfer_profile_id = $1", [jake])).rows[0].c;
  assert.deepEqual(card.map((h) => h.strokes), [4, 4, 5, ...Array(15).fill(4)]);
  // Locked again after resubmission, on every path.
  await refused(ops(db, jake, group, jake, [queued(3, 6, 3)]), /already submitted/);
  await refused(call(db, "save_hole_scores", jake, group, jake, now(), [{ hole: 3, strokes: 6 }]), /already submitted/);
  assert.ok((await call<Scoring>(db, "get_trip_round_scoring", jake, trip, 1)).groups[0].players.find((p) => p.profileId === jake)?.submittedAt);
});

test("Step 6 fix 2: ordering races: a write sent while pending, then approval, then the same write again", async () => {
  const db = await scoringDatabase();
  const { cade, jake, mike, group } = await submittedCard(db);
  const req = (await request(db, jake, group, jake, [3], "Hole 3")).request;
  const early = queued(3, 5, 1);
  await refused(ops(db, jake, group, jake, [early]), /already submitted/);
  await refused(ops(db, mike, group, jake, [queued(3, 5, 1, false)]), /already submitted/);
  await decide(db, cade, req.id, true);
  assert.equal((await ops(db, jake, group, jake, [early])).results[0].status, "conflict", "the same op resent after approval is based on the pre-lock version, so it conflicts");
  // Approval racing a second decision: the first one wins and the card stays reopened.
  assert.equal((await decide(db, cade, req.id, false)).status, "already-decided");
  assert.equal((await ops(db, jake, group, jake, [queued(3, 5, 2)])).results[0].status, "applied");
});

test("Step 6 fix 3: nobody approves their own request; an organizer's card is decided by their attester", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake, mike, stranger } = await tripWithPlayers(db);
  const group = (await startScoring(db, cade, trip, [pair(cade, jake)])).groups[0].id;
  assert.equal((await submit(db, cade, group, cade, await fullMatchingCard(db, group, cade, jake))).status, "submitted");
  assert.equal((await submit(db, jake, group, jake, await fullMatchingCard(db, group, jake, cade))).status, "submitted");
  const own = (await request(db, cade, group, cade, [2], "Hole 2 was a 5")).request;
  await refused(decide(db, cade, own.id, true), /decide your own/);
  await refused(decide(db, mike, own.id, true), /Only the trip organizer/);
  await refused(decide(db, stranger, own.id, true), /Only the trip organizer/);
  const canDecide = async (who: string) => (await call<{ requests: { id: string; canDecide: boolean }[] }>(db, "get_scorecard_corrections", who, trip, 1)).requests.find((r) => r.id === own.id)?.canDecide;
  assert.deepEqual([await canDecide(cade), await canDecide(jake), await canDecide(mike)], [false, true, false], "the screen offers Approve / Deny only to who may decide");
  assert.equal((await decide(db, jake, own.id, true)).status, "approved", "the organizer's designated attester approves");
  assert.equal((await decide(db, jake, own.id, false)).status, "already-decided");
  assert.equal(await canDecide(jake), false, "nothing left to decide");
  // A non-organizer's request: still only the organizer (here also Jake's attester) decides, never Jake.
  const jakes = (await request(db, jake, group, jake, [4], "Hole 4")).request;
  await refused(decide(db, jake, jakes.id, true), /decide your own/);
  assert.equal((await decide(db, cade, jakes.id, false, "Looked right")).status, "denied");
});

test("Step 6 fix 3: an attester who is no longer on the trip can't decide the organizer's request", async () => {
  const db = await scoringDatabase();
  const { trip, cade, jake } = await tripWithPlayers(db);
  const group = (await startScoring(db, cade, trip, [pair(cade, jake)])).groups[0].id;
  assert.equal((await submit(db, cade, group, cade, await fullMatchingCard(db, group, cade, jake))).status, "submitted");
  const req = (await request(db, cade, group, cade, [2], "Hole 2")).request;
  await db.query("delete from golf_trip_members where golf_trip_id = $1 and profile_id = $2", [trip, jake]);
  await refused(decide(db, jake, req.id, true), /Only the trip organizer/);
  await refused(decide(db, cade, req.id, true), /decide your own/);
});
