import { test } from "node:test";
import assert from "node:assert/strict";
import { changedEntries, holeEntriesFromBody, liveTripRound, myScoringSeat, tripGroupsPayload, tripScoringFromJson, type HoleEntryInput } from "./tripScoring.ts";

const member = (n: number, extra: Partial<{ profileId: string | null; invitationStatus: string; role: "organizer" | "member" }> = {}) => ({
  id: `m${n}`, profileId: `p${n}`, displayName: `Player ${n}`, email: null, role: "member" as const, invitationStatus: "accepted", ...extra,
});

test("trip groups: accepted members with an account, in member order, fours with attesters", () => {
  const groups = tripGroupsPayload([member(1, { role: "organizer" }), member(2), member(3, { profileId: null, invitationStatus: "pending" }), member(4), member(5), member(6, { invitationStatus: "declined" }), member(7)]);
  assert.deepEqual(groups.map((g) => g.players.map((p) => p.profileId)), [["p1", "p2", "p4", "p5", "p7"]]);
  assert.deepEqual(groups[0].players.map((p) => p.attesterProfileId), ["p7", "p1", "p2", "p4", "p5"]);
});

test("trip groups: 6 players → a four (pairs) and a two", () => {
  const groups = tripGroupsPayload([1, 2, 3, 4, 5, 6].map((n) => member(n)));
  assert.deepEqual(groups.map((g) => g.players.map((p) => `${p.profileId}<${p.attesterProfileId}`)), [["p1<p2", "p2<p1", "p3<p4", "p4<p3"], ["p5<p6", "p6<p5"]]);
});

test("trip groups: fewer than 2 players can't be scored (a trip round needs an attester)", () => {
  assert.throws(() => tripGroupsPayload([member(1)]), /at least 2 players/);
  assert.throws(() => tripGroupsPayload([]), /at least 2 players/);
});

test("the live round is the first round played today", () => {
  const rounds = [{ roundNumber: 1, dayNumber: 1, playDate: "2027-04-10", courseName: "A" }, { roundNumber: 2, dayNumber: 2, playDate: "2027-04-11", courseName: "B" }, { roundNumber: 3, dayNumber: 2, playDate: "2027-04-11", courseName: "C" }];
  assert.equal(liveTripRound(rounds, "2027-04-11")?.roundNumber, 2);
  assert.equal(liveTripRound(rounds, "2027-04-12"), null);
  assert.equal(liveTripRound([{ roundNumber: 1, dayNumber: 1, playDate: null, courseName: null }], "2027-04-12"), null);
});

const json = {
  roundId: "r1", roundNumber: 1,
  groups: [{ id: "g1", groupNumber: 1, lockedAt: "2027-04-11T15:00:00Z", players: [
    { profileId: "p1", displayName: "Cade", playOrder: 1, side: null, attesterProfileId: "p2", submittedAt: null },
    { profileId: "p2", displayName: "Jake", playOrder: 2, side: null, attesterProfileId: "p1", submittedAt: null },
  ] }],
  entries: [
    { scoredProfileId: "p1", enteredByProfileId: "p1", hole: 1, strokes: 5, putts: 2, fairway: "center", green: "left", penaltyFairway: false, penaltyGreen: true, clientUpdatedAt: "t", version: 1 },
    { scoredProfileId: "p1", enteredByProfileId: "p2", hole: 1, strokes: 5, putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "t", version: 1 },
    { scoredProfileId: "p2", enteredByProfileId: "p1", hole: 2, strokes: 4, putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "t", version: 3 },
  ],
};

test("the database's answer is read and checked; anything malformed is rejected", () => {
  const scoring = tripScoringFromJson(json)!;
  assert.equal(scoring.groups[0].players[1].displayName, "Jake");
  assert.equal(scoring.entries.length, 3);
  assert.equal(tripScoringFromJson({ ...json, entries: [{ ...json.entries[0], hole: 19 }] }), null);
  assert.equal(tripScoringFromJson({ ...json, groups: "nope" }), null);
  assert.equal(tripScoringFromJson(null), null);
});

test("my seat: my own card, what my attester entered for me, and what I entered for my attestee", () => {
  const seat = myScoringSeat(tripScoringFromJson(json)!, "p1")!;
  assert.equal(seat.groupId, "g1");
  assert.equal(seat.attesteeId, "p2");
  assert.equal(seat.attesteeName, "Jake");
  assert.equal(seat.card.holes[0], 5);
  assert.equal(seat.card.putts[0], 2);
  assert.deepEqual(seat.card.penalties[0], { fairway: false, green: true });
  assert.equal(seat.card.holes[1], null);
  assert.equal(seat.attestedForMe[0], 5);
  assert.equal(seat.myAttestEntries[1], 4);
  assert.equal(myScoringSeat(tripScoringFromJson(json)!, "stranger"), null);
});

test("only holes that changed since the last save are sent; a cleared stat is sent as null", () => {
  const blank = Array<null>(18).fill(null);
  const before: HoleEntryInput[] = [];
  const own = changedEntries({ holes: [5, ...blank.slice(1)], putts: [2, ...blank.slice(1)], fairways: blank, greens: blank, penalties: blank.map(() => ({ fairway: false, green: false })) }, true, before);
  assert.deepEqual(own.map((e) => e.hole), [1]);
  assert.equal(own[0].strokes, 5);
  const again = changedEntries({ holes: [5, ...blank.slice(1)], putts: [null, ...blank.slice(1)], fairways: blank, greens: blank, penalties: blank.map(() => ({ fairway: false, green: false })) }, true, own);
  assert.deepEqual(again.map((e) => [e.hole, e.putts]), [[1, null]]);
  const attest = changedEntries({ holes: [null, 4, ...blank.slice(2)] }, false, []);
  assert.deepEqual(attest, [{ hole: 2, strokes: 4 }]);
});

test("the API body is checked: group, golfer, 1–18 holes, sane values; attester entries carry strokes only", () => {
  const ok = holeEntriesFromBody({ groupId: "6c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", scoredProfileId: "7c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", clientUpdatedAt: "2027-04-11T15:00:00.000Z", entries: [{ hole: 3, strokes: 4, putts: 2, fairway: "center", green: null, penaltyFairway: false, penaltyGreen: false }] });
  assert.equal(ok.ok, true);
  assert.equal(holeEntriesFromBody({ ...(ok.ok ? {} : {}), groupId: "x", scoredProfileId: "y", clientUpdatedAt: "z", entries: [] }).ok, false);
  const bad = (entry: Record<string, unknown>) => holeEntriesFromBody({ groupId: "6c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", scoredProfileId: "7c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", clientUpdatedAt: "2027-04-11T15:00:00.000Z", entries: [entry] }).ok;
  assert.equal(bad({ hole: 0, strokes: 4 }), false);
  assert.equal(bad({ hole: 3, strokes: 25 }), false);
  assert.equal(bad({ hole: 3, strokes: 4, fairway: "sideways" }), false);
  assert.equal(bad({ hole: 3, strokes: 4, putts: 11 }), false);
});

test("after a save, the saved holes replace what was sent before (by hole); my name comes with my seat", async () => {
  const { mergeSent } = await import("./tripScoring.ts");
  const merged = mergeSent([{ hole: 1, strokes: 5 }, { hole: 2, strokes: 4 }], [{ hole: 2, strokes: 3 }, { hole: 5, strokes: 6 }]);
  assert.deepEqual(merged.sort((a, b) => a.hole - b.hole), [{ hole: 1, strokes: 5 }, { hole: 2, strokes: 3 }, { hole: 5, strokes: 6 }]);
  assert.equal(myScoringSeat(tripScoringFromJson(json)!, "p2")!.myName, "Jake");
});

test("my seat also carries my attestee's own strokes, for the column I keep", () => {
  const withOwn = tripScoringFromJson({ ...json, entries: [...json.entries, { ...json.entries[2], enteredByProfileId: "p2", version: 1 }] })!;
  assert.equal(myScoringSeat(withOwn, "p1")!.attesteeOwn[1], 4);
  assert.equal(myScoringSeat(tripScoringFromJson(json)!, "p1")!.attesteeOwn[1], null);
});

test("latest wins: an answer to an older request never replaces a newer one", async () => {
  const { latestGate } = await import("./tripScoring.ts");
  const gate = latestGate();
  const first = gate.begin(), second = gate.begin();
  assert.equal(gate.accept(second), true);
  assert.equal(gate.accept(first), false);
  assert.equal(gate.accept(gate.begin()), true);
});

test("scores are verified only when nothing is unsaved and the connection is live", async () => {
  const { scoresVerified } = await import("./tripScoring.ts");
  assert.equal(scoresVerified({ connected: true, unsaved: false, saving: 0 }), true);
  assert.equal(scoresVerified({ connected: false, unsaved: false, saving: 0 }), false);
  assert.equal(scoresVerified({ connected: true, unsaved: true, saving: 0 }), false);
  assert.equal(scoresVerified({ connected: true, unsaved: false, saving: 1 }), false);
});

const G = "6c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", P = "7c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", O1 = "8c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10", O2 = "9c0f2f2e-8a4c-4c3e-9a1e-2b9d6f1f3a10";
const opsBody = (ops: unknown[], extra: Record<string, unknown> = {}) => ({ groupId: G, scoredProfileId: P, expectedProfileId: P, ops, ...extra });

test("queued ops in the API body are checked: uuid op ids, versions, earlier ops, one per hole", async () => {
  const { holeOpsFromBody } = await import("./tripScoring.ts");
  const ok = holeOpsFromBody(opsBody([{ opId: O1, baseVersion: 2, supersedes: [O2], clientUpdatedAt: "2027-04-11T15:00:00.000Z", entry: { hole: 3, strokes: 4 } }]));
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.expectedProfileId, P); assert.equal(ok.ops[0].baseVersion, 2); assert.deepEqual(ok.ops[0].supersedes, [O2]); }
  const bad = (op: Record<string, unknown>) => holeOpsFromBody(opsBody([{ opId: O1, baseVersion: 0, supersedes: [], clientUpdatedAt: "2027-04-11T15:00:00.000Z", entry: { hole: 3, strokes: 4 }, ...op }])).ok;
  assert.equal(bad({ opId: "x" }), false);
  assert.equal(bad({ baseVersion: -1 }), false);
  assert.equal(bad({ supersedes: ["nope"] }), false);
  assert.equal(bad({ entry: { hole: 19, strokes: 4 } }), false);
  assert.equal(holeOpsFromBody(opsBody([{ opId: O1, baseVersion: 0, supersedes: [], clientUpdatedAt: "2027-04-11T15:00:00.000Z", entry: { hole: 3, strokes: 4 } }], { expectedProfileId: "x" })).ok, false);
  // Step 6: an attester's entry made for an open correction carries its request id (a uuid), passed on to the database.
  const withId = holeOpsFromBody(opsBody([{ opId: O1, baseVersion: 0, supersedes: [], clientUpdatedAt: "2027-04-11T15:00:00.000Z", entry: { hole: 3, strokes: 4 }, correctionRequestId: O2 }]));
  assert.equal(withId.ok && withId.ops[0].correctionRequestId, O2);
  assert.equal(ok.ok && "correctionRequestId" in ok.ops[0], false, "absent unless sent");
  assert.equal(bad({ correctionRequestId: "nope" }), false);
});

test("the server's op results are checked; anything malformed is rejected", async () => {
  const { opResultsFromJson } = await import("./tripScoring.ts");
  const answer = { results: [{ opId: O1, status: "applied", version: 3 }, { opId: O2, status: "conflict", version: 4, server: { hole: 2, strokes: 6, putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false } }], scoring: json };
  const parsed = opResultsFromJson(answer)!;
  assert.equal(parsed.results[1].server?.strokes, 6);
  assert.equal(parsed.scoring?.roundId, "r1");
  assert.equal(opResultsFromJson({ ...answer, results: [{ opId: O1, status: "maybe", version: 3 }] }), null);
  assert.equal(opResultsFromJson({ ...answer, results: [{ opId: O1, status: "locked", version: 3 }] })?.results[0].status, "locked", "Step 6: a hole outside an approved correction");
});

test("the card is rebuilt from saved entries with queued (offline) ones on top", async () => {
  const { cardFromEntries } = await import("./tripScoring.ts");
  const card = cardFromEntries([{ hole: 1, strokes: 5, putts: 2, fairway: "center", green: null, penaltyFairway: false, penaltyGreen: true }], [{ hole: 2, strokes: 4 }]);
  assert.equal(card.holes[0], 5);
  assert.equal(card.putts[0], 2);
  assert.deepEqual(card.penalties[0], { fairway: false, green: true });
  assert.equal(card.holes[1], null);
  assert.equal(card.opponentHoles[1], 4);
  assert.equal(card.opponentHoles[0], null);
});
