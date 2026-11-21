import { test } from "node:test";
import assert from "node:assert/strict";
import { previewClock, SAMPLE_LOCAL_NOW } from "./sampleNotifications";
import { WIDGET_SAMPLE_NOW } from "./sampleWidget";

test("every notification preview shows one clock: Friday, October 16, 2:11", () => {
  assert.deepEqual(previewClock(), { time: "2:11", long: "Friday, October 16", short: "Fri, Oct 16" });
  assert.deepEqual(previewClock("2026-11-21T09:05"), { time: "9:05", long: "Saturday, November 21", short: "Sat, Nov 21" });
  assert.deepEqual(previewClock("2026-11-21T00:30").time, "12:30");
  assert.equal(WIDGET_SAMPLE_NOW, SAMPLE_LOCAL_NOW);
});
