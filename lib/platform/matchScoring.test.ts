import { test } from "node:test";
import assert from "node:assert/strict";
import { matchScoring } from "./golfTripPreviewFixture.ts";

test("a round's scoring: its Handicap setting, else Both with handicap on / Gross without", () => {
  assert.equal(matchScoring({ scoring: "Gross", handicap: true }), "Gross");
  assert.equal(matchScoring({ scoring: "Net", handicap: false }), "Net");
  assert.equal(matchScoring({ handicap: true }), "Both");
  assert.equal(matchScoring({ handicap: false }), "Gross");
});
