import { test } from "node:test";
import assert from "node:assert/strict";
import { holeSubmissionStatus, scoringSides, validHoleDraft, sameHoleDraft, type HoleSubmission, type ScoringPair } from "./holeSubmission.ts";

const box: ScoringPair = { format: "Singles", maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"] };
const cam: HoleSubmission = { player: "cam-latto", hole: 1, ownScore: 4, opponentScore: 5, putts: 2, fairway: "hit", green: "short", submittedAt: "2026-09-14T10:00:00Z" };
const cade: HoleSubmission = { ...cam, player: "cade-barone", ownScore: 5, opponentScore: 4 };

test("a submitted hole waits for both scorers before confirmation", () => {
  assert.equal(holeSubmissionStatus(box, cam.player, 1, []), "empty");
  assert.equal(holeSubmissionStatus(box, cam.player, 1, [cam]), "submitted");
  assert.equal(holeSubmissionStatus(box, cade.player, 1, [cam]), "empty");
  for (const player of [cam.player, cade.player]) assert.equal(holeSubmissionStatus(box, player, 1, [cam, cade]), "confirmed");
});

test("either score disagreement makes both phones disputed; corrections restore agreement", () => {
  for (const changes of [{ ownScore: 6 }, { opponentScore: 6 }]) {
    for (const player of [cam.player, cade.player]) assert.equal(holeSubmissionStatus(box, player, 1, [cam, { ...cade, ...changes }]), "disputed");
  }
  assert.equal(holeSubmissionStatus(box, cam.player, 1, [cam, cade]), "confirmed");
});

test("missing information blocks submission; zero putts and directional misses are complete", () => {
  assert.equal(validHoleDraft(cam, 4, "Singles"), true);
  for (const changes of [{ putts: null }, { fairway: null }, { green: null }, { putts: -1 }, { putts: 8 }, { ownScore: 0 }, { opponentScore: 2.5 }]) {
    assert.equal(validHoleDraft({ ...cam, ...changes }, 4, "Singles"), false);
  }
  assert.equal(validHoleDraft({ ...cam, putts: 0, fairway: "left", green: "penalty" }, 4, "Singles"), true);
  assert.equal(validHoleDraft({ ...cam, fairway: null }, 3, "Singles"), true);
});

test("Fourball uses the assigned opposing position, not a teammate or other pair", () => {
  const fourball: ScoringPair = { format: "Fourball", maroonPlayers: [cam.player, "pete-peabody"], whitePlayers: [cade.player, "kyle-schnabel"] };
  assert.deepEqual(scoringSides(fourball, cam.player).opponents, [cade.player]);
  assert.deepEqual(scoringSides(fourball, "pete-peabody").opponents, ["kyle-schnabel"]);
  assert.deepEqual(scoringSides(fourball, "unknown").opponents, []);
  assert.equal(holeSubmissionStatus(fourball, cam.player, 1, [cam, { ...cade, player: "kyle-schnabel" }]), "submitted");
});

test("editing a submitted score or stat requires resubmission", () => {
  assert.equal(sameHoleDraft(cam, { ...cam }, 4, "Singles"), true);
  for (const changes of [{ putts: 1 }, { green: "hit" as const }, { ownScore: 6 }, { opponentScore: 6 }, { fairway: "left" as const }]) {
    assert.equal(sameHoleDraft(cam, { ...cam, ...changes }, 4, "Singles"), false);
  }
});

test("Alternate Shot compares both team scores without individual stats", () => {
  const foursome: ScoringPair = { ...box, format: "Foursome", maroonPlayers: [cam.player, "pete-peabody"], whitePlayers: [cade.player, "kyle-schnabel"] };
  assert.equal(validHoleDraft({ ...cam, putts: null, fairway: null, green: null }, 4, "Foursome"), true);
  assert.equal(holeSubmissionStatus(foursome, "pete-peabody", 1, [cam, cade]), "confirmed");
  assert.equal(holeSubmissionStatus(foursome, "kyle-schnabel", 1, [cam, { ...cade, ownScore: 7 }]), "disputed");
});
