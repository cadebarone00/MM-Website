import { test } from "node:test";
import assert from "node:assert/strict";
import { cardVersion, submissionCheck, submitRefusal, submitResultFromJson, submitBodyFrom } from "./tripSubmission.ts";
import type { HoleScoreEntry, TripRoundScoring } from "./tripScoring.ts";

const ME = "11111111-1111-4111-8111-111111111111", ATT = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333";
const own = (hole: number, strokes: number | null, extra: Partial<HoleScoreEntry> = {}): HoleScoreEntry => ({ scoredProfileId: ME, enteredByProfileId: ME, hole, strokes, putts: 2, fairway: "center", green: "center", penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "t", version: 1, ...extra });
const att = (hole: number, strokes: number | null, version = 1): HoleScoreEntry => ({ scoredProfileId: ME, enteredByProfileId: ATT, hole, strokes, putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "t", version });
const holes = Array.from({ length: 18 }, (_, i) => i + 1);
const scoring = (entries: HoleScoreEntry[], submittedAt: string | null = null): TripRoundScoring => ({ roundId: "r", roundNumber: 1, entries,
  groups: [{ id: G, groupNumber: 1, lockedAt: "x", players: [
    { profileId: ME, displayName: "Cade", playOrder: 1, side: null, attesterProfileId: ATT, submittedAt },
    { profileId: ATT, displayName: "Jake", playOrder: 2, side: null, attesterProfileId: ME, submittedAt: null }] }] });
const full = () => [...holes.map((h) => own(h, 4)), ...holes.map((h) => att(h, 4))];

test("a complete card matching the attester on all 18 can be submitted", () => {
  assert.deepEqual(submissionCheck(scoring(full()), ME, ME), { ok: true });
});

test("only the golfer submits their own card", () => {
  assert.deepEqual(submissionCheck(scoring(full()), ATT, ME), { ok: false, reason: "not-yours" });
  assert.deepEqual(submissionCheck(scoring(full()), "stranger", ME), { ok: false, reason: "not-yours" });
});

test("incomplete: a missing score or stat on any hole names the holes", () => {
  const entries = full()
    .filter((e) => !(e.enteredByProfileId === ME && e.hole === 18))
    .map((e) => e.enteredByProfileId === ME && e.hole === 7 ? { ...e, putts: null } : e);
  assert.deepEqual(submissionCheck(scoring(entries), ME, ME), { ok: false, reason: "incomplete", holes: [7, 18] });
});

test("mismatched: my strokes vs my attester's, or a hole the attester hasn't entered", () => {
  const entries = full().map((e) => e.enteredByProfileId === ATT && e.hole === 5 ? { ...e, strokes: 5 } : e).filter((e) => !(e.enteredByProfileId === ATT && e.hole === 9));
  assert.deepEqual(submissionCheck(scoring(entries), ME, ME), { ok: false, reason: "mismatch", holes: [5, 9] });
});

test("Step 6: a reopened card says when the attester hasn't re-attested a corrected hole, separately from a real mismatch", () => {
  // Approval cleared the attester's hole 3 and 7; hole 7 has been re-attested, hole 3 hasn't.
  const entries = [...holes.map((h) => own(h, 4)), ...holes.map((h) => att(h, h === 3 ? null : 4))];
  assert.deepEqual(submissionCheck(scoring(entries), ME, ME, [3, 7]), { ok: false, reason: "unattested", holes: [3] });
  // Re-attested with a different number: that's a real mismatch, with the existing message.
  const differs = [...holes.map((h) => own(h, 4)), ...holes.map((h) => att(h, h === 3 ? 5 : 4))];
  assert.deepEqual(submissionCheck(scoring(differs), ME, ME, [3, 7]), { ok: false, reason: "mismatch", holes: [3] });
  // Outside a correction an empty attester hole stays a mismatch, as before.
  assert.deepEqual(submissionCheck(scoring(entries), ME, ME), { ok: false, reason: "mismatch", holes: [3] });
  assert.match(submitRefusal({ status: "rejected", reason: "unattested", holes: [3], scoring: null }), /hasn't re-attested hole 3 for this correction/);
  assert.match(submitRefusal({ status: "rejected", reason: "mismatch", holes: [3], scoring: null }), /doesn't match yours on hole 3/);
  assert.equal(submitResultFromJson({ status: "rejected", reason: "unattested", holes: [3, 7], scoring: null })?.status, "rejected", "the server's new reason is accepted");
});

test("already submitted is not an error to re-check (the server answers it idempotently)", () => {
  assert.deepEqual(submissionCheck(scoring(full(), "2027-04-11T20:00:00Z"), ME, ME), { ok: true, alreadySubmitted: true });
});

test("the card version moves whenever my row or my attester's row for me changes, and nothing else", () => {
  const base = cardVersion(scoring(full()), ME);
  assert.equal(base, 36);
  assert.equal(cardVersion(scoring(full().map((e) => e.enteredByProfileId === ATT && e.hole === 3 ? { ...e, version: 2 } : e)), ME), 37);
  const other: HoleScoreEntry = { ...att(1, 4), scoredProfileId: ATT, enteredByProfileId: ME, version: 9 };
  assert.equal(cardVersion(scoring([...full(), other]), ME), 36, "my entries for my attestee aren't on my card");
});

test("the submit body carries who the phone thinks is signed in and the version it verified", () => {
  assert.deepEqual(submitBodyFrom(G, ME, 36), { groupId: G, golferProfileId: ME, expectedProfileId: ME, cardVersion: 36 });
});

test("the server's submit answer is checked", () => {
  assert.deepEqual(submitResultFromJson({ status: "submitted", submittedAt: "2027-04-11T20:00:00Z", scoring: null }), { status: "submitted", submittedAt: "2027-04-11T20:00:00Z", scoring: null });
  assert.deepEqual(submitResultFromJson({ status: "rejected", reason: "stale", holes: [], scoring: null }), { status: "rejected", reason: "stale", holes: [], scoring: null });
  assert.equal(submitResultFromJson({ status: "maybe" }), null);
  assert.equal(submitResultFromJson({ status: "rejected", reason: "because" }), null);
});
