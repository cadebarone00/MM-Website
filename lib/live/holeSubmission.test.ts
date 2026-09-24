import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScorecardRows, holeSubmissionStatus, scoringSides, validHoleDraft, sameHoleDraft, type HoleSubmission, type ScoringPair } from "./holeSubmission.ts";

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

const holes = [{ number: 1, par: 4, yards: 410 }, { number: 2, par: 3, yards: 165 }];

test("buildScorecardRows fills a row from a player's own submission, and null for a hole they haven't submitted", () => {
  const rows = buildScorecardRows(holes, cam.player, [cam], "Singles");
  assert.deepEqual(rows[0], { hole: 1, par: 4, yards: 410, score: 4, putts: 2, fir: true, firDirection: null, gir: false, girDirection: "short" });
  assert.deepEqual(rows[1], { hole: 2, par: 3, yards: 165, score: null, putts: null, fir: null, firDirection: null, gir: null, girDirection: null });
});

test("buildScorecardRows shows fairway as not applicable on a par 3, even though a score is in", () => {
  const par3 = [{ number: 1, par: 3, yards: 165 }];
  const submission: HoleSubmission = { ...cam, hole: 1, fairway: null, green: "hit" };
  const rows = buildScorecardRows(par3, cam.player, [submission], "Singles");
  assert.equal(rows[0].score, 4);
  assert.equal(rows[0].fir, null);
  assert.equal(rows[0].gir, true);
});

test("buildScorecardRows shows putts/fairway/green as not applicable for Alternate Shot, which never collects them", () => {
  const submission: HoleSubmission = { ...cam, hole: 1, putts: null, fairway: null, green: null };
  const rows = buildScorecardRows(holes, cam.player, [submission], "Foursome");
  assert.equal(rows[0].score, 4);
  assert.equal(rows[0].putts, null);
  assert.equal(rows[0].fir, null);
  assert.equal(rows[0].gir, null);
});
