import { test } from "node:test";
import assert from "node:assert/strict";
import { correctionDecisionFromBody, correctionRequestFromBody, correctionsFromJson, correctionView, holeEditable, openCorrectionHoles, tripCorrectionListFromJson } from "./tripCorrections.ts";

const G = "33333333-3333-4333-8333-333333333333", ME = "11111111-1111-4111-8111-111111111111", R = "44444444-4444-4444-8444-444444444444";

test("a correction request body: my own card, unique holes 1–18 (sorted), a 3–500 character reason", () => {
  const ok = correctionRequestFromBody({ groupId: G, golferProfileId: ME, expectedProfileId: ME, holes: [7, 3], reason: "  Hole 3 was a 5  " });
  assert.deepEqual(ok, { ok: true, groupId: G, golferProfileId: ME, expectedProfileId: ME, holes: [3, 7], reason: "Hole 3 was a 5" });
  const bad = (extra: Record<string, unknown>) => correctionRequestFromBody({ groupId: G, golferProfileId: ME, expectedProfileId: ME, holes: [3], reason: "Wrong", ...extra }).ok;
  assert.equal(bad({ holes: [] }), false);
  assert.equal(bad({ holes: [3, 3] }), false);
  assert.equal(bad({ holes: [0] }), false);
  assert.equal(bad({ holes: [19] }), false);
  assert.equal(bad({ holes: [2.5] }), false);
  assert.equal(bad({ reason: "ok" }), false);
  assert.equal(bad({ reason: "x".repeat(501) }), false);
  assert.equal(bad({ groupId: "nope" }), false);
});

test("a decision body: request id, approve yes/no, optional short note", () => {
  assert.deepEqual(correctionDecisionFromBody({ requestId: R, approve: false, note: " Scores were right ", expectedProfileId: ME }),
    { ok: true, requestId: R, approve: false, note: "Scores were right", expectedProfileId: ME });
  assert.equal(correctionDecisionFromBody({ requestId: R, approve: "yes", expectedProfileId: ME }).ok, false);
  assert.equal(correctionDecisionFromBody({ requestId: R, approve: true, note: "x".repeat(501), expectedProfileId: ME }).ok, false);
});

const extra = (golferName: string) => ({ golferName, decidedByName: null, roundNumber: 1, playDate: "2027-04-11" });
const snapshot = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, strokes: 4, putts: 2, fairway: "center", green: "left", penaltyFairway: false, penaltyGreen: false, attestStrokes: 4 }));
const json = {
  isOrganizer: true,
  requests: [
    { id: R, groupId: G, golferProfileId: ME, revision: 1, holes: [3], reason: "Wrong", status: "denied", requestedAt: "2027-04-11T20:00:00Z", decidedBy: ME, decidedAt: "2027-04-11T20:05:00Z", decisionNote: "Right as is", resubmittedAt: null, canDecide: false, ...extra("Cade"), decidedByName: "Jake" },
    { id: "55555555-5555-4555-8555-555555555555", groupId: G, golferProfileId: ME, revision: 1, holes: [7], reason: "Hole 7", status: "pending", requestedAt: "2027-04-11T20:10:00Z", decidedBy: null, decidedAt: null, decisionNote: null, resubmittedAt: null, canDecide: false, ...extra("Cade") },
    { id: "66666666-6666-4666-8666-666666666666", groupId: G, golferProfileId: "22222222-2222-4222-8222-222222222222", revision: 1, holes: [1, 2], reason: "Typo", status: "pending", requestedAt: "2027-04-11T20:12:00Z", decidedBy: null, decidedAt: null, decisionNote: null, resubmittedAt: null, canDecide: true, ...extra("Jake") },
  ],
  revisions: [{ groupId: G, golferProfileId: ME, revision: 1, submittedAt: "2027-04-11T19:00:00Z", submittedBy: ME, cardVersion: 36, correctionRequestId: null, submittedByName: "Cade", reason: null, isCurrent: true, card: snapshot }],
};

test("the database's answer is read and checked", () => {
  assert.equal(correctionsFromJson(json)?.requests.length, 3);
  assert.equal(correctionsFromJson({ ...json, requests: [{ ...json.requests[0], status: "maybe" }] }), null);
  assert.equal(correctionsFromJson({ ...json, revisions: "nope" }), null);
  assert.equal(correctionsFromJson({ ...json, requests: [{ ...json.requests[0], canDecide: undefined }] }), null, "canDecide is required");
  assert.equal(correctionsFromJson({ ...json, revisions: [{ ...json.revisions[0], card: [{ hole: 19, strokes: 4 }] }] }), null, "a snapshot hole must be 1–18");
  assert.equal(correctionsFromJson({ ...json, revisions: [{ ...json.revisions[0], isCurrent: "yes" }] }), null);
});

test("my view: my latest request, my history with snapshots, and only the pending requests I may decide (never my own)", () => {
  const view = correctionView(correctionsFromJson(json)!, ME);
  assert.equal(view.myRequest?.status, "pending", "the latest of mine");
  assert.deepEqual(view.revisions.map((r) => [r.revision, r.submittedByName, r.isCurrent, r.card.length]), [[1, "Cade", true, 18]]);
  assert.deepEqual(view.pending.map((p) => [p.name, p.holes]), [["Jake", [1, 2]]], "the organizer's own request isn't in their decision list");
  const member = correctionView({ ...json, requests: json.requests.map((r) => ({ ...r, canDecide: false })) } as never, ME);
  assert.deepEqual(member.pending, [], "nothing to decide when the database says so");
});

test("denying needs a reason (approving doesn't)", () => {
  assert.equal(correctionDecisionFromBody({ requestId: R, approve: false, expectedProfileId: ME }).ok, false);
  assert.equal(correctionDecisionFromBody({ requestId: R, approve: false, note: "   ", expectedProfileId: ME }).ok, false);
  assert.equal(correctionDecisionFromBody({ requestId: R, approve: true, expectedProfileId: ME }).ok, true);
});

test("Trip Settings → Corrections: rounds and requests are read and checked", () => {
  const list = { isOrganizer: false, rounds: [{ roundNumber: 1, playDate: "2027-04-11", courseName: null, played: true, mySubmitted: true, myReopened: false }], requests: json.requests };
  assert.equal(tripCorrectionListFromJson(list)?.rounds.length, 1);
  assert.equal(tripCorrectionListFromJson({ ...list, rounds: [{ ...list.rounds[0], played: "yes" }] }), null);
  assert.equal(tripCorrectionListFromJson({ ...list, requests: [{ ...json.requests[0], roundNumber: "1" }] }), null);
});

test("locked-hole UI: with an approved correction only its holes are editable, for my card and for the golfer I attest", () => {
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const approved = (golfer: string, holes: number[], id = R) => ({ ...json, requests: [{ ...json.requests[2], id, golferProfileId: golfer, holes, status: "approved", canDecide: false }] }) as never;
  // My card reopened for hole 3 and 7: only those; nothing open for my attest column.
  const mine = openCorrectionHoles(approved(ME, [3, 7]), ME, OTHER);
  assert.deepEqual(mine, { own: [3, 7], attest: null, attestRequestId: null });
  assert.deepEqual(Array.from({ length: 18 }, (_, i) => holeEditable(mine.own, false, i + 1)).flatMap((ok, i) => ok ? [i + 1] : []), [3, 7]);
  // The golfer I attest is reopened: only those holes of my column, even though MY card is submitted.
  const theirs = openCorrectionHoles(approved(OTHER, [5]), ME, OTHER);
  assert.deepEqual(theirs, { own: null, attest: [5], attestRequestId: R });
  assert.equal(holeEditable(theirs.attest, true, 5), true);
  assert.equal(holeEditable(theirs.attest, true, 6), false);
  // No open correction: unchanged behavior (editable until submitted).
  assert.equal(holeEditable(null, false, 9), true);
  assert.equal(holeEditable(null, true, 9), false);
  // Pending or denied requests never open anything.
  assert.deepEqual(openCorrectionHoles(correctionsFromJson(json), ME, OTHER), { own: null, attest: null, attestRequestId: null });
  assert.deepEqual(openCorrectionHoles(null, ME, OTHER), { own: null, attest: null, attestRequestId: null });
});
