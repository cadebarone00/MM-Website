import { test } from "node:test";
import assert from "node:assert/strict";
import { matchScoring, matchStatus, matchWinPct } from "./golfTripPreviewFixture.ts";

test("a round's scoring: its Handicap setting, else Both with handicap on / Gross without", () => {
  assert.equal(matchScoring({ scoring: "Gross", handicap: true }), "Gross");
  assert.equal(matchScoring({ scoring: "Net", handicap: false }), "Net");
  assert.equal(matchScoring({ handicap: true }), "Both");
  assert.equal(matchScoring({ handicap: false }), "Gross");
});

test("match status: tee time before, THRU during, the final result after", () => {
  assert.deepEqual(matchStatus({ teeTime: "8:30 AM", standing: null }), { kind: "tee", time: "8:30 AM" });
  assert.deepEqual(matchStatus({ thru: "Thru 12", standing: { leader: "left", up: 2 } }), { kind: "thru", holes: 12 });
  // Up 5 with 4 to play: over, 5&4. Up 1 after 18: 1 UP. Level after 18: AS.
  assert.deepEqual(matchStatus({ thru: "Thru 14", standing: { leader: "right", up: 5 } }), { kind: "final", text: "5&4" });
  assert.deepEqual(matchStatus({ thru: "F", standing: { leader: "left", up: 1 } }), { kind: "final", text: "1 UP" });
  assert.deepEqual(matchStatus({ thru: "F", standing: { leader: null, up: 0 } }), { kind: "final", text: "AS" });
  assert.deepEqual(matchStatus({ thru: "", standing: null, result: "4&2" }), { kind: "final", text: "4&2" });
});

test("a match's win chances: 50 before it starts, the leader's edge grows late, 100 / 0 / 50 once it's over", () => {
  assert.equal(matchWinPct(null, 0, false), 50);
  assert.equal(matchWinPct({ leader: null, up: 0 }, 9, false), 50);
  assert.ok(matchWinPct({ leader: "left", up: 2 }, 15, false) > matchWinPct({ leader: "left", up: 2 }, 3, false));
  assert.ok(matchWinPct({ leader: "right", up: 1 }, 9, false) < 50);
  assert.equal(matchWinPct({ leader: "left", up: 9 }, 17, false), 97);
  // An early lead isn't a lock: 3 up after 4 holes stays well short of 90%.
  assert.ok(matchWinPct({ leader: "left", up: 3 }, 4, false) < 85);
  assert.equal(matchWinPct({ leader: "right", up: 3 }, 18, true), 0);
  assert.equal(matchWinPct({ leader: null, up: 0 }, 18, true), 50);
});
