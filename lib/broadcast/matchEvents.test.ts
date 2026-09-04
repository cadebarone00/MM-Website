import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMatchBoxEvent, detectRoundFinal, isRoundComplete } from "./matchEvents.ts";
import type { MatchBoxResult } from "@/lib/live/orchestration";
import { scoreKey, type LiveMatchBox, type LiveTournamentSnapshot } from "@/lib/live/types";

function result(overrides: Partial<MatchBoxResult> = {}): MatchBoxResult {
  return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18, ...overrides };
}

function box(overrides: Partial<LiveMatchBox> = {}): LiveMatchBox {
  return {
    id: "box-1",
    seasonYear: 2027,
    round: 1,
    boxNumber: 1,
    format: "Singles",
    teeTime: new Date("2027-06-01T12:00:00Z"),
    maroonPlayers: ["maroon-1"],
    whitePlayers: ["white-1"],
    state: "Live",
    started: true,
    ...overrides,
  };
}

/** Empty snapshot — matchBoxResult only reads snapshot.scores + the box itself. */
function emptySnapshot(matchBoxes: LiveMatchBox[] = []): LiveTournamentSnapshot {
  return { players: {}, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes };
}

/** Scores every hole 1..count for maroonPlayer/whitePlayer so maroon wins every hole (closes the box). */
function scoreHolesMaroonWins(snapshot: LiveTournamentSnapshot, maroonPlayer: string, whitePlayer: string, round: number, count: number): void {
  for (let hole = 1; hole <= count; hole++) {
    snapshot.scores.set(scoreKey(maroonPlayer, round, hole), {
      seasonYear: 2027,
      player: maroonPlayer,
      round,
      hole,
      score: 3,
      putts: null,
      fir: null,
      gir: null,
      hostEdited: false,
    });
    snapshot.scores.set(scoreKey(whitePlayer, round, hole), {
      seasonYear: 2027,
      player: whitePlayer,
      round,
      hole,
      score: 4,
      putts: null,
      fir: null,
      gir: null,
      hostEdited: false,
    });
  }
}

test("detectMatchBoxEvent returns null when nothing changed", () => {
  const r = result({ leader: "maroon", margin: 1, holesRemaining: 10 });
  assert.equal(detectMatchBoxEvent(r, r, "box-1", 2027, 3), null);
});

test("detectMatchBoxEvent returns MATCH_STATE_CHANGED when leader/margin/holesRemaining shift but the box isn't closed", () => {
  const before = result({ leader: "maroon", margin: 1, holesRemaining: 10 });
  const after = result({ leader: "maroon", margin: 2, holesRemaining: 9 });
  const event = detectMatchBoxEvent(before, after, "box-1", 2027, 3);
  assert.deepEqual(event, { kind: "MATCH_STATE_CHANGED", seasonYear: 2027, matchBoxId: "box-1", round: 3, leader: "maroon", margin: 2, holesRemaining: 9 });
});

test("detectMatchBoxEvent returns MATCH_WON when a box closes at 18 holes complete", () => {
  const before = result({ leader: "white", margin: 1, holesRemaining: 1 });
  const after = result({ leader: "white", margin: 1, holesRemaining: 0, whitePts: 1 });
  const event = detectMatchBoxEvent(before, after, "box-2", 2027, 1);
  assert.deepEqual(event, { kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-2", round: 1, leader: "white", margin: 1, maroonPts: 0, whitePts: 1 });
});

test("detectMatchBoxEvent returns MATCH_WON on an early closeout (3&2) — the case effectiveMatchState-based detection would have missed", () => {
  const before = result({ leader: "maroon", margin: 2, holesRemaining: 3 });
  const after = result({ leader: "maroon", margin: 3, holesRemaining: 2, maroonPts: 1 }); // margin(3) > holesRemaining(2): decided early
  const event = detectMatchBoxEvent(before, after, "box-3", 2027, 2);
  assert.deepEqual(event, { kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-3", round: 2, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 });
});

test("detectMatchBoxEvent returns null once a box is already closed, even if a later (moot) hole is entered", () => {
  const before = result({ leader: "maroon", margin: 3, holesRemaining: 2, maroonPts: 1 });
  const after = result({ leader: "maroon", margin: 4, holesRemaining: 1, maroonPts: 1 });
  assert.equal(detectMatchBoxEvent(before, after, "box-3", 2027, 2), null);
});

test("detectRoundFinal fires only on the false -> true transition", () => {
  assert.deepEqual(detectRoundFinal(false, true, 2027, 4), { kind: "ROUND_FINAL", seasonYear: 2027, round: 4 });
  assert.equal(detectRoundFinal(true, true, 2027, 4), null);
  assert.equal(detectRoundFinal(false, false, 2027, 4), null);
  assert.equal(detectRoundFinal(true, false, 2027, 4), null);
});

test("isRoundComplete returns false for a round with no match boxes", () => {
  const snapshot = emptySnapshot([]);
  assert.equal(isRoundComplete(snapshot, 1), false);
});

test("isRoundComplete returns false when at least one box in the round isn't closed", () => {
  const closedBox = box({ id: "box-1", boxNumber: 1, maroonPlayers: ["m1"], whitePlayers: ["w1"] });
  const openBox = box({ id: "box-2", boxNumber: 2, maroonPlayers: ["m2"], whitePlayers: ["w2"] });
  const snapshot = emptySnapshot([closedBox, openBox]);
  scoreHolesMaroonWins(snapshot, "m1", "w1", 1, 18); // closedBox: maroon wins all 18 -> closed
  // openBox gets no scores at all -> maroonPts/whitePts stay 0/0, not closed
  assert.equal(isRoundComplete(snapshot, 1), false);
});

test("isRoundComplete returns true when every box in the round is closed", () => {
  const box1 = box({ id: "box-1", boxNumber: 1, maroonPlayers: ["m1"], whitePlayers: ["w1"] });
  const box2 = box({ id: "box-2", boxNumber: 2, maroonPlayers: ["m2"], whitePlayers: ["w2"] });
  const snapshot = emptySnapshot([box1, box2]);
  scoreHolesMaroonWins(snapshot, "m1", "w1", 1, 18);
  scoreHolesMaroonWins(snapshot, "m2", "w2", 1, 18);
  assert.equal(isRoundComplete(snapshot, 1), true);
});
