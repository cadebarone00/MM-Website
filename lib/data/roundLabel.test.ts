// lib/data/roundLabel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoundLabel } from "./roundLabel.ts";

test("formatRoundLabel shows the round number normally", () => {
  assert.equal(formatRoundLabel(1), "Round 1");
  assert.equal(formatRoundLabel(8), "Round 8");
});

test("formatRoundLabel shows the individual-champion sentinel as Round INDI", () => {
  assert.equal(formatRoundLabel(0), "Round INDI");
});
