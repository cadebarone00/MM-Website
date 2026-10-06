import { test } from "node:test";
import assert from "node:assert/strict";
import { tripRoundOpen } from "./tripRoundState.ts";

test("a round opens on its scheduled day by itself", () => assert.equal(tripRoundOpen(undefined, true), true));
test("not scheduled today and never started → closed", () => assert.equal(tripRoundOpen(undefined, false), false));
test("Start round opens it early; End round closes it even on the day", () => {
  assert.equal(tripRoundOpen({ state: "open", openedAt: "x" }, false), true);
  assert.equal(tripRoundOpen({ state: "closed", closedAt: "x" }, true), false);
});
