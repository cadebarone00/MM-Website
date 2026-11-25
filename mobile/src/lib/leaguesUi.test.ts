/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { changeKey, dayLabel, firstName, groupProgress, handicapOk, handicapValue, leagueCourseFrom, placeLabel, playersText } from "./leaguesUi.ts";

test("handicaps: -10 to 54, blank is fine", () => {
  assert.equal(handicapValue("8.4"), 8.4);
  assert.equal(handicapValue("-3"), -3);
  assert.equal(handicapValue("55"), null);
  assert.equal(handicapValue("abc"), null);
  assert.equal(handicapOk(""), true);
  assert.equal(handicapOk("60"), false);
});

test("places tie as T2", () => {
  assert.equal(placeLabel(2, [1, 2, 2, 4]), "T2");
  assert.equal(placeLabel(1, [1, 2, 2, 4]), "1");
  assert.equal(placeLabel(null, [null]), "–");
});

test("changes to the same thing share a key", () => {
  assert.equal(changeKey({ action: "strokes", player: "a", hole: 3, strokes: 4 }), "strokes:a:3");
  assert.equal(changeKey({ action: "submit", group: 2 }), "submit:2");
  assert.equal(changeKey({ action: "end" }), "end");
});

test("small words", () => {
  assert.equal(dayLabel("2026-11-12"), "Thu, Nov 12");
  assert.equal(firstName("Alex  Smith"), "Alex");
  assert.equal(playersText(1), "1 player");
  assert.equal(playersText(3), "3 players");
  assert.equal(groupProgress(true, 4), "Card in");
  assert.equal(groupProgress(false, 0), "Not started");
  assert.equal(groupProgress(false, 7), "Thru 7");
  assert.equal(groupProgress(false, 18), "Finished");
});

test("league course: 18 holes only, tee kept, stroke index only when complete", () => {
  const par = Array.from({ length: 18 }, () => 4);
  const course = { ref: "r", name: "Oak", place: "", par, strokeIndex: par.map((_, i) => i + 1), tees: [{ name: "Blue", rating: 71.2, slope: 128 }] };
  assert.deepEqual(leagueCourseFrom(course, 0), { ref: "r", name: "Oak", place: null, par, strokeIndex: par.map((_, i) => i + 1), tee: { name: "Blue", rating: 71.2, slope: 128 } });
  assert.equal(leagueCourseFrom({ ...course, strokeIndex: [null, ...par.slice(1)] }, 0)?.strokeIndex, null);
  assert.equal(leagueCourseFrom({ ...course, tees: [] }, 0)?.tee, null);
  assert.equal(leagueCourseFrom({ ...course, par: par.slice(0, 9) }, 0), null);
});
