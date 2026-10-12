import assert from "node:assert/strict";
import test from "node:test";
import { removeScheduleSlot, shiftScheduleDays } from "./scheduleDateShift";

test("deleting the first round preserves the second round and other dates", () => {
  const second = { course: "Second course", tee: "Blue", time: "09:00" };
  assert.deepEqual(removeScheduleSlot({ "0-0": { course: "First" }, "0-1": second, "1-0": { course: "Tomorrow" } }, 0, 0), {
    "0-0": second, "1-0": { course: "Tomorrow" },
  });
  assert.deepEqual(removeScheduleSlot({ "0-0": "First", "0-1": "Second" }, 0, 1), { "0-0": "First" });
  assert.deepEqual(removeScheduleSlot({ "0-0": "Only" }, 0, 0), {});
});

test("adding arrival golf leaves Jan 23 selections on Jan 23 and preserves both rounds", () => {
  // Before: first golf date Jan 23. After: Jan 22, so Jan 23 becomes index 1.
  const courses = { "0-0": "Course A", "0-1": "Course B", "1-0": "Course C" };
  assert.deepEqual(shiftScheduleDays(courses, 1), { "1-0": "Course A", "1-1": "Course B", "2-0": "Course C" });
  assert.deepEqual(shiftScheduleDays({ 0: 2, 1: 1 }, 1), { 1: 2, 2: 1 });
});

test("hidden arrival selections survive disabling and re-enabling arrival golf", () => {
  const courses = { "0-0": "Arrival course", "1-0": "Next day" };
  const hidden = shiftScheduleDays(courses, -1);
  assert.equal(hidden["-1-0"], "Arrival course");
  assert.equal(hidden["0-0"], "Next day");
  assert.deepEqual(shiftScheduleDays(hidden, 1), courses);
});

test("moving arrival earlier or later preserves settings without collisions", () => {
  const settings = { "0-0": { tee: "Blue", time: "08:00" }, "2-1": { tee: "White", time: "10:00" } };
  assert.deepEqual(shiftScheduleDays(shiftScheduleDays(settings, 5), -5), settings);
  assert.deepEqual(shiftScheduleDays(settings, 0), settings);
});
