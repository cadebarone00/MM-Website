import { test } from "node:test";
import assert from "node:assert/strict";
import { tripRoundOpen } from "./tripRoundState.ts";

test("a round opens on its scheduled day by itself", () => assert.equal(tripRoundOpen(undefined, true), true));
test("not scheduled today and never started → closed", () => assert.equal(tripRoundOpen(undefined, false), false));
test("Start round opens it early; End round closes it even on the day", () => {
  assert.equal(tripRoundOpen({ state: "open", openedAt: "x" }, false), true);
  assert.equal(tripRoundOpen({ state: "closed", closedAt: "x" }, true), false);
});

test("Organizer settings shows a round that opened by itself as Open, with End round", async () => {
  const { roundRow } = await import("./tripRoundState.ts");
  assert.deepEqual(roundRow(undefined, true), { label: "Open", next: "closed" });
  assert.deepEqual(roundRow(undefined, false), { label: "Opens on its day", next: "open" });
  assert.deepEqual(roundRow({ state: "closed" }, true), { label: "Ended", next: "open" });
  assert.deepEqual(roundRow({ state: "open" }, false), { label: "Open", next: "closed" });
});
