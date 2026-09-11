// lib/data/courseLocation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCourseLocation } from "./courseLocation.ts";

test("formatCourseLocation joins city and state", () => {
  assert.equal(formatCourseLocation("The Colony", "TX"), "The Colony, TX");
});

test("formatCourseLocation falls back to whichever half is set", () => {
  assert.equal(formatCourseLocation("The Colony", null), "The Colony");
  assert.equal(formatCourseLocation(null, "TX"), "TX");
});

test("formatCourseLocation returns null when neither is set", () => {
  assert.equal(formatCourseLocation(null, null), null);
  assert.equal(formatCourseLocation("", "  "), null);
});
