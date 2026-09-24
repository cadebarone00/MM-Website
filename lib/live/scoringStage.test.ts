// lib/live/scoringStage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoringStage } from "./scoringStage.ts";

const base = { hasMatch: true, matchState: "Live" as const, holesEntered: 0, roundCard: "waiting" as const, iSubmitted: false };

test("the Scoring tab stage follows the round: none, upcoming, begin, continue, ready, submitted", () => {
  assert.equal(scoringStage({ ...base, hasMatch: false, matchState: null }), "none");
  assert.equal(scoringStage({ ...base, matchState: "Scheduled" }), "upcoming");
  assert.equal(scoringStage({ ...base, matchState: "Armed" }), "upcoming");
  assert.equal(scoringStage(base), "begin");
  assert.equal(scoringStage({ ...base, holesEntered: 4 }), "continue");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "disputed" }), "continue");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "match" }), "ready");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "match", iSubmitted: true }), "submitted");
});
