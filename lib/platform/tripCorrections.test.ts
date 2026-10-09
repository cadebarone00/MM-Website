import { test } from "node:test";
import assert from "node:assert/strict";
import { correctionDecisionFromBody, correctionRequestFromBody, correctionsFromJson, correctionView } from "./tripCorrections.ts";

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

const json = {
  isOrganizer: true,
  requests: [
    { id: R, groupId: G, golferProfileId: ME, revision: 1, holes: [3], reason: "Wrong", status: "denied", requestedAt: "2027-04-11T20:00:00Z", decidedBy: ME, decidedAt: "2027-04-11T20:05:00Z", decisionNote: "Right as is", resubmittedAt: null, canDecide: false },
    { id: "55555555-5555-4555-8555-555555555555", groupId: G, golferProfileId: ME, revision: 1, holes: [7], reason: "Hole 7", status: "pending", requestedAt: "2027-04-11T20:10:00Z", decidedBy: null, decidedAt: null, decisionNote: null, resubmittedAt: null, canDecide: false },
    { id: "66666666-6666-4666-8666-666666666666", groupId: G, golferProfileId: "22222222-2222-4222-8222-222222222222", revision: 1, holes: [1, 2], reason: "Typo", status: "pending", requestedAt: "2027-04-11T20:12:00Z", decidedBy: null, decidedAt: null, decisionNote: null, resubmittedAt: null, canDecide: true },
  ],
  revisions: [{ groupId: G, golferProfileId: ME, revision: 1, submittedAt: "2027-04-11T19:00:00Z", submittedBy: ME, cardVersion: 36, correctionRequestId: null, submittedByName: "Cade" }],
};

test("the database's answer is read and checked", () => {
  assert.equal(correctionsFromJson(json)?.requests.length, 3);
  assert.equal(correctionsFromJson({ ...json, requests: [{ ...json.requests[0], status: "maybe" }] }), null);
  assert.equal(correctionsFromJson({ ...json, revisions: "nope" }), null);
  assert.equal(correctionsFromJson({ ...json, requests: [{ ...json.requests[0], canDecide: undefined }] }), null, "canDecide is required");
});

test("my view: my latest request, my history, and only the pending requests I may decide (never my own)", () => {
  const view = correctionView(correctionsFromJson(json)!, ME, (id) => id === ME ? "Cade" : "Jake");
  assert.equal(view.myRequest?.status, "pending", "the latest of mine");
  assert.deepEqual(view.revisions.map((r) => [r.revision, r.submittedByName]), [[1, "Cade"]]);
  assert.deepEqual(view.pending.map((p) => [p.name, p.holes]), [["Jake", [1, 2]]], "the organizer's own request isn't in their decision list");
  const member = correctionView({ ...json, requests: json.requests.map((r) => ({ ...r, canDecide: false })) } as never, ME, () => "x");
  assert.deepEqual(member.pending, [], "nothing to decide when the database says so");
});
