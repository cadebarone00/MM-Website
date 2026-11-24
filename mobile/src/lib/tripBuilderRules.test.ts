/// <reference types="node" />
// The Trip Builder's rules the app relies on all come from the website's shared code: these pin how the app uses them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRoundsToDates, firstMissingStep, nextStep, previousStep } from "@/lib/platform/tripBuilderSteps";
import { plannedRounds, reviewRows, tripDates } from "@/lib/platform/golfTripDraft";
import { tripBuilderSetupValues } from "@/lib/platform/tripBuilderSetup";
import { hasSeen, markSeen, TOUR_SEEN_KEY } from "@/lib/platform/tripTour";
import { rangeTap, monthGrid } from "./tripBuilderUi.ts";

test("step order skips Teams / Format unless competing, and Courses when golf was skipped", () => {
  assert.equal(nextStep("players", { competing: "no" }), "golf");
  assert.equal(nextStep("players", { competing: "yes" }), "teams");
  assert.equal(nextStep("golf", { golfSkipped: "1" }), "lodging");
  assert.equal(nextStep("lodging", {}), "create");
  assert.equal(previousStep("basics", {}), "start");
  assert.equal(previousStep("golf", { competing: "yes" }), "teams");
});

test("missing answers send you back; shorter dates drop golf days outside them", () => {
  assert.equal(firstMissingStep({}), "basics");
  assert.equal(firstMissingStep({ tripName: "X", destination: "Y" }), "dates");
  assert.equal(firstMissingStep({ tripName: "X", destination: "Y", startDate: "2027-04-22", endDate: "2027-04-24" }), null);
  const draft = { startDate: "2027-04-22", endDate: "2027-04-23", golfDays: "3", day1Date: "2027-04-22", day2Date: "2027-04-23", day3Date: "2027-04-24", round3Course: "Gone" };
  const clamped = clampRoundsToDates(draft);
  assert.equal(clamped.golfDays, "2");
  assert.equal(clamped.day3Date, undefined);
  assert.equal(clamped.round3Course, undefined);
});

test("rounds, dates and review rows", () => {
  assert.equal(tripDates("2027-04-22", "2027-04-25").length, 4);
  assert.equal(plannedRounds({ golfDays: "2", day1Rounds: "2", day2Rounds: "1" }).length, 3);
  assert.equal(reviewRows({ tripName: "Maroon Masters" })[0].value, "Maroon Masters");
});

test("competing answers become the trip's Settings; not competing = nothing to save", () => {
  assert.equal(tripBuilderSetupValues({ competing: "no" }), null);
  assert.ok(tripBuilderSetupValues({ competing: "yes", teamStructure: "two-teams", formatPreset: "team", golfDays: "1" }));
});

test("the tour is seen once per account", () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  assert.equal(hasSeen(TOUR_SEEN_KEY, "acct-1", store), false);
  markSeen(TOUR_SEEN_KEY, "acct-1", store);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "acct-1", store), true);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "acct-2", store), false);
});

test("the calendar: first tap starts, second tap ends, a tap before the start restarts", () => {
  assert.deepEqual(rangeTap({ start: null, end: null }, "2027-04-22"), { start: "2027-04-22", end: null });
  assert.deepEqual(rangeTap({ start: "2027-04-22", end: null }, "2027-04-25"), { start: "2027-04-22", end: "2027-04-25" });
  assert.deepEqual(rangeTap({ start: "2027-04-22", end: null }, "2027-04-20"), { start: "2027-04-20", end: null });
  assert.deepEqual(rangeTap({ start: "2027-04-22", end: "2027-04-25" }, "2027-04-28"), { start: "2027-04-28", end: null });
  assert.deepEqual(rangeTap({ start: "2027-04-22", end: null }, "2027-04-22"), { start: "2027-04-22", end: "2027-04-22" });
});

test("the calendar's month grid: weeks start Sunday, blanks before the 1st", () => {
  const grid = monthGrid(2027, 3); // April 2027 starts on a Thursday
  assert.equal(grid.slice(0, 4).every((d) => d === null), true);
  assert.equal(grid[4], "2027-04-01");
  assert.equal(grid.filter(Boolean).length, 30);
});
