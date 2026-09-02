import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatchBox, LiveTournamentSnapshot } from "./types.ts";
import { updateScore } from "./scoring.ts";
import { canScoreStrokesFor, effectiveMatchState, holeComplete, matchBoxResult, matchBoxStartedThru, roundIsComplete, scoresAgree, thruLabel, validateMatchBox } from "./orchestration.ts";

const SEED_HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i === 3 || i === 5 || i === 12 ? 3 : i === 4 || i === 7 || i === 13 || i === 17 ? 5 : 4, yards: 400 }));

function seedSnapshot(): LiveTournamentSnapshot {
  return {
    players: Object.fromEntries(
      ["cam", "drew", "cade", "collin", "hugo", "luke", "dalton", "jackson", "nate", "pete", "kyle", "quez"].map((p, i) => [
        p,
        { team: i % 2 === 0 ? "maroon" : "white" },
      ])
    ),
    courses: { c1: { id: "c1", name: "2027 Maroon Masters", holes: SEED_HOLES, rating: null, slope: null } },
    roundCourses: { 1: "c1" },
    scores: new Map(),
    matchBoxes: [],
  };
}

function box(round: number, boxNumber: number, maroon: string[], white: string[], format: LiveMatchBox["format"] = "Fourball"): LiveMatchBox {
  return {
    id: null,
    seasonYear: 2027,
    round,
    boxNumber,
    format,
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    maroonPlayers: maroon,
    whitePlayers: white,
    state: "Scheduled",
    started: false,
  };
}

test("roundIsComplete requires the right box count and full, non-overlapping roster for the format", () => {
  const snapshot = seedSnapshot();
  assert.equal(roundIsComplete(snapshot, 1, "Fourball"), false);

  snapshot.matchBoxes = [
    box(1, 1, ["cam", "drew"], ["cade", "collin"]),
    box(1, 2, ["hugo", "luke"], ["dalton", "jackson"]),
    box(1, 3, ["nate", "pete"], ["kyle", "quez"]),
  ];
  assert.equal(roundIsComplete(snapshot, 1, "Fourball"), true);
  // Same players, but Singles needs 6 boxes of 1v1, not 3 boxes of 2v2 —
  // right roster, wrong box count for this format.
  assert.equal(roundIsComplete(snapshot, 1, "Singles"), false);
});

test("validateMatchBox requires 2 players per side for Fourball/Foursome and 1 for Singles", () => {
  const snapshot = seedSnapshot();
  const shortHanded: LiveMatchBox = { id: null, seasonYear: 2027, round: 1, boxNumber: 1, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam"], whitePlayers: ["drew", "collin"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, shortHanded), ["Pick exactly 2 Maroon players."]);

  const singlesBox: LiveMatchBox = { id: null, seasonYear: 2027, round: 1, boxNumber: 1, format: "Singles", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam"], whitePlayers: ["drew"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, singlesBox), []);
});

test("validateMatchBox caps box number at the format's box count", () => {
  const snapshot = seedSnapshot();
  const outOfRange: LiveMatchBox = { id: null, seasonYear: 2027, round: 1, boxNumber: 4, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam", "cade"], whitePlayers: ["drew", "collin"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, outOfRange), ["Match box must be between 1 and 3 for Fourball."]);

  const inRangeForSingles: LiveMatchBox = { ...outOfRange, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"] };
  assert.deepEqual(validateMatchBox(snapshot, inRangeForSingles), []);
});

test("validateMatchBox rejects a player already assigned elsewhere in the round", () => {
  const snapshot = seedSnapshot();
  snapshot.matchBoxes = [box(1, 1, ["cam", "cade"], ["drew", "collin"])];
  const conflicting: LiveMatchBox = { id: null, seasonYear: 2027, round: 1, boxNumber: 2, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam", "hugo"], whitePlayers: ["luke", "jackson"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, conflicting), ["Players already assigned in this round: cam."]);
});

// This is the check the matchups lock leans on: a round can be "complete"
// (right box count, 12 unique players) and still be wrong if someone changed
// teams or left the roster after their box was built.
test("validateMatchBox catches a player whose roster team no longer matches their side", () => {
  const snapshot = seedSnapshot();
  const built = box(1, 1, ["cam", "hugo"], ["drew", "collin"]);
  snapshot.matchBoxes = [built];
  assert.deepEqual(validateMatchBox(snapshot, built), []);

  // Tiger moves hugo to White and drops drew from the roster entirely.
  snapshot.players.hugo = { team: "white" };
  delete snapshot.players.drew;
  assert.deepEqual(validateMatchBox(snapshot, built), ["hugo is not on Team Maroon.", "drew is not on Team White."]);

  // A round can still look complete while those boxes are wrong.
  snapshot.matchBoxes = [built, box(1, 2, ["cade", "dalton"], ["luke", "jackson"]), box(1, 3, ["nate", "kyle"], ["pete", "quez"])];
  assert.equal(roundIsComplete(snapshot, 1, "Fourball"), true);
});

test("match state moves from scheduled to armed to live", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);

  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T10:00:00-06:00")), "Scheduled");

  matchBox.started = true;
  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:00:00-06:00")), "Armed");
  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:30:00-06:00")), "Live");
});

test("thru label never displays Thru 18", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  matchBox.started = true;
  const round = 1;
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];

  assert.equal(thruLabel(snapshot, matchBox), "Thru");

  for (const player of players) updateScore(snapshot, player, round, 1, 4, 2, true, true);
  assert.equal(thruLabel(snapshot, matchBox), "Thru 1");

  for (let hole = 2; hole <= 18; hole++) {
    for (const player of players) updateScore(snapshot, player, round, hole, 4, 2, true, true);
  }
  assert.equal(thruLabel(snapshot, matchBox), "Final");
});

test("matchBoxResult closes a match when maroon wins the first 15 holes outright", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  // Maroon wins the first 15 holes outright (margin 15, completed 15,
  // holesRemaining 3) — margin > holesRemaining, so the match closes there
  // without needing holes 16-18 played.
  for (let hole = 1; hole <= 15; hole++) {
    updateScore(snapshot, "cam", round, hole, 3, 1, true, true);
    updateScore(snapshot, "drew", round, hole, 3, 1, true, true);
    updateScore(snapshot, "cade", round, hole, 5, 2, true, true);
    updateScore(snapshot, "collin", round, hole, 5, 2, true, true);
  }

  const result = matchBoxResult(snapshot, matchBox);

  assert.equal(result.leader, "maroon");
  assert.equal(result.maroonPts, 1);
  assert.equal(result.whitePts, 0);
  assert.ok(result.margin > result.holesRemaining || result.holesRemaining === 0);
});

test("matchBoxResult halves a fully-played tied match", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  for (let hole = 1; hole <= 18; hole++) {
    updateScore(snapshot, "cam", round, hole, 4, 2, true, true);
    updateScore(snapshot, "drew", round, hole, 4, 2, true, true);
    updateScore(snapshot, "cade", round, hole, 4, 2, true, true);
    updateScore(snapshot, "collin", round, hole, 4, 2, true, true);
  }

  const result = matchBoxResult(snapshot, matchBox);

  assert.equal(result.leader, "tie");
  assert.equal(result.maroonPts, 0.5);
  assert.equal(result.whitePts, 0.5);
  assert.equal(result.holesRemaining, 0);
});

test("effectiveMatchState returns Final once 18 holes are complete, even if not marked started", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  for (let hole = 1; hole <= 18; hole++) {
    for (const player of [...matchBox.maroonPlayers, ...matchBox.whitePlayers]) {
      updateScore(snapshot, player, round, hole, 4, 2, true, true);
    }
  }

  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:00:00-06:00")), "Final");
});

test("holeComplete and matchBoxResult treat Foursome like a 1v1 with one shared score per side", () => {
  const snapshot = seedSnapshot();
  const foursome = box(1, 1, ["cam", "drew"], ["cade", "collin"], "Foursome");
  // Both players on a side always hold the identical value (the write
  // path guarantees this — see Task 6) — a real fixture reflects that.
  for (const hole of [1, 2, 3]) {
    updateScore(snapshot, "cam", 1, hole, 4, 0, null, false);
    updateScore(snapshot, "drew", 1, hole, 4, 0, null, false);
    updateScore(snapshot, "cade", 1, hole, 5, 0, null, false);
    updateScore(snapshot, "collin", 1, hole, 5, 0, null, false);
  }
  assert.equal(holeComplete(snapshot, foursome, 1), true);
  assert.equal(matchBoxStartedThru(snapshot, foursome), 3);
  const result = matchBoxResult(snapshot, foursome);
  assert.equal(result.leader, "maroon");
  assert.equal(result.margin, 3);
});

test("canScoreStrokesFor requires the exact opposing pair position for Fourball/Singles", () => {
  const fourball = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cade"]), true);
  assert.equal(canScoreStrokesFor(fourball, "drew", ["collin"]), true);
  assert.equal(canScoreStrokesFor(fourball, "cam", ["collin"]), false, "cam is paired with cade, not collin");
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cade", "collin"]), false, "exactly one target for Fourball");
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cam"]), false, "cannot score your own strokes");

  const singles: LiveMatchBox = { ...fourball, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["cade"] };
  assert.equal(canScoreStrokesFor(singles, "cam", ["cade"]), true);
  assert.equal(canScoreStrokesFor(singles, "cade", ["cam"]), true);
});

test("scoresAgree requires both values present and equal", () => {
  assert.equal(scoresAgree(4, 4), true);
  assert.equal(scoresAgree(4, 5), false);
  assert.equal(scoresAgree(null, 4), false);
  assert.equal(scoresAgree(4, null), false);
  assert.equal(scoresAgree(null, null), false);
});

test("canScoreStrokesFor requires the whole opposing side for Foursome", () => {
  const foursome = box(1, 1, ["cam", "drew"], ["cade", "collin"], "Foursome");
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cade", "collin"]), true);
  assert.equal(canScoreStrokesFor(foursome, "drew", ["cade", "collin"]), true, "either player on your side can enter the opposing side's shared score");
  assert.equal(canScoreStrokesFor(foursome, "cade", ["cam", "drew"]), true);
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cade"]), false, "must name the whole opposing side, not one player");
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cam", "drew"]), false, "cannot score your own side");
});
