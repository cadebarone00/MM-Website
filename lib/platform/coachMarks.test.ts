import { test } from "node:test";
import assert from "node:assert/strict";
import { coachStops } from "./coachMarks.ts";

test("organizer gets 4 stops starting with where skipped things live", () => {
  const stops = coachStops(true);
  assert.equal(stops.length, 4);
  assert.match(stops[0].text, /^Anything you skipped/);
});

test("members get 3 stops and nothing about skipped setup", () => {
  const stops = coachStops(false);
  assert.equal(stops.length, 3);
  assert.equal(stops.some(stop => /skipped/i.test(stop.text)), false);
  assert.ok(stops.some(stop => /invite link/i.test(stop.text)));
});

test("every stop points at a known button", () => {
  for (const stop of [...coachStops(true), ...coachStops(false)]) assert.ok(["settings", "golf-tab", "scoring"].includes(stop.target), stop.target);
});
