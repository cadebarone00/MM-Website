import { test } from "node:test";
import assert from "node:assert/strict";
import { TRIP_BUILDER_STEPS, clampRoundsToDates, firstMissingStep, nextStep, previousStep, stepPath } from "./tripBuilderSteps.ts";

test("the step order", () => {
  assert.deepEqual([...TRIP_BUILDER_STEPS], ["basics", "dates", "players", "teams", "golf", "courses", "format", "lodging"]);
  assert.equal(stepPath("basics"), "/golf-trips/new");
  assert.equal(stepPath("teams"), "/golf-trips/new/teams");
});

test("Teams and Formats only when competing = yes, both ways", () => {
  assert.equal(nextStep("players", { competing: "no" }), "golf");
  assert.equal(nextStep("players", { competing: "" }), "golf");
  assert.equal(nextStep("players", { competing: "yes" }), "teams");
  assert.equal(previousStep("golf", { competing: "no" }), "players");
  assert.equal(previousStep("golf", { competing: "yes" }), "teams");
  assert.equal(nextStep("courses", { competing: "" }), "lodging");
  assert.equal(nextStep("courses", { competing: "yes" }), "format");
  assert.equal(previousStep("lodging", { competing: "no" }), "courses");
  assert.equal(previousStep("lodging", { competing: "yes" }), "format");
});

test("skipping golf skips Courses too", () => {
  assert.equal(nextStep("golf", { golfSkipped: "1", competing: "yes" }), "format");
  assert.equal(nextStep("golf", { golfSkipped: "1" }), "lodging");
  assert.equal(previousStep("lodging", { golfSkipped: "1" }), "golf");
  assert.equal(previousStep("format", { golfSkipped: "1", competing: "yes" }), "golf");
});

test("ends: basics goes back to the start, lodging goes to create", () => {
  assert.equal(previousStep("basics", {}), "start");
  assert.equal(nextStep("lodging", {}), "create");
});

test("firstMissingStep sends people back to what's required", () => {
  assert.equal(firstMissingStep({}), "basics");
  assert.equal(firstMissingStep({ tripName: "A" }), "basics");
  assert.equal(firstMissingStep({ tripName: "A", destination: "B" }), "dates");
  assert.equal(firstMissingStep({ tripName: "A", destination: "B", startDate: "2027-04-22", endDate: "2027-04-20" }), "dates");
  assert.equal(firstMissingStep({ tripName: "A", destination: "B", startDate: "2027-04-22", endDate: "2027-04-24" }), null);
});

test("clampRoundsToDates drops golf days that no longer fit the trip", () => {
  const draft = { startDate: "2027-04-22", endDate: "2027-04-23", golfDays: "4",
    day1Date: "2027-04-22", day2Date: "2027-04-23", day3Date: "2027-04-24", day4Date: "2027-04-25", day1Rounds: "2", day3Rounds: "1",
    round1Course: "A", round2Course: "B", round3Course: "C", round4Course: "D", round5Course: "E" };
  const out = clampRoundsToDates(draft);
  assert.equal(out.golfDays, "2");
  assert.equal(out.day3Date, undefined);
  assert.equal(out.day3Rounds, undefined);
  assert.equal(out.day1Rounds, "2");
  assert.equal(out.round3Course, "C", "day1 (2 rounds) + day2 (1) = 3 rounds kept");
  assert.equal(out.round4Course, undefined);
  assert.equal(out.round5Course, undefined);
});

test("clampRoundsToDates leaves a fitting draft alone", () => {
  const draft = { startDate: "2027-04-22", endDate: "2027-04-25", golfDays: "2", day1Date: "2027-04-22", day2Date: "2027-04-23" };
  assert.deepEqual(clampRoundsToDates(draft), draft);
});
