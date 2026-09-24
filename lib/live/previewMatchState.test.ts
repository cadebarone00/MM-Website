import { test } from "node:test";
import assert from "node:assert/strict";
import { previewOfficialState } from "./previewMatchState.ts";
import type { HoleSubmission } from "./holeSubmission.ts";

const box = { format: "Singles" as const, maroonPlayers: ["cade-barone"], whitePlayers: ["cam-latto"] };
const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1 }));

function entry(player: string, hole: number, own: number, opp: number, at: string): HoleSubmission {
  return { player, hole, ownScore: own, opponentScore: opp, putts: 2, fairway: "hit", green: "hit", submittedAt: at };
}

test("no confirmed holes yet is all square, thru 0, not mathematically complete", () => {
  const state = previewOfficialState(box, 1, holes, []);
  assert.deepEqual(state, { leader: "tie", margin: 0, thru: 0, mathematicallyComplete: false });
});

test("only agreeing holes count — a disputed hole stops \"thru\" from advancing", () => {
  const submissions = [
    entry("cade-barone", 1, 4, 5, "2027-01-01T10:01:00Z"), entry("cam-latto", 1, 5, 4, "2027-01-01T10:01:01Z"),
    entry("cade-barone", 2, 4, 5, "2027-01-01T10:02:00Z"), entry("cam-latto", 2, 9, 4, "2027-01-01T10:02:01Z"), // disputed
  ];
  const state = previewOfficialState(box, 1, holes, submissions);
  assert.equal(state.thru, 1, "hole 2 disagrees, so thru stops at hole 1");
  assert.equal(state.leader, "maroon", "cade (4) beat cam (5) on hole 1");
  assert.equal(state.margin, 1);
});

test("mathematically complete once the margin exceeds the holes left, same as the real match-state rule", () => {
  const submissions: HoleSubmission[] = [];
  for (let hole = 1; hole <= 16; hole++) {
    submissions.push(entry("cade-barone", hole, 3, 6, `2027-01-01T10:${String(hole).padStart(2, "0")}:00Z`));
    submissions.push(entry("cam-latto", hole, 6, 3, `2027-01-01T10:${String(hole).padStart(2, "0")}:01Z`));
  }
  const state = previewOfficialState(box, 1, holes, submissions);
  assert.equal(state.leader, "maroon");
  assert.equal(state.margin, 10, "match closes the moment the margin passes the holes left (10 up with 8 to play), same as matchBoxResult");
  assert.equal(state.mathematicallyComplete, true);
  assert.equal(state.thru, 10, "18 - holesRemaining(8) = 10, matching the real system's closed-out thru");
});
