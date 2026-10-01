import assert from "node:assert/strict";
import test from "node:test";
import { parseGolfTripDraft, plannedRounds, shortTripDate, tripDates } from "./golfTripDraft";

test("tripDates lists every day from start to end", () => {
  assert.deepEqual(tripDates("2027-04-22", "2027-04-26"), ["2027-04-22", "2027-04-23", "2027-04-24", "2027-04-25", "2027-04-26"]);
  assert.deepEqual(tripDates("2027-04-22", "2027-04-22"), ["2027-04-22"]);
  assert.deepEqual(tripDates("2027-02-27", "2027-03-01"), ["2027-02-27", "2027-02-28", "2027-03-01"]);
});

test("tripDates is empty for missing, bad or backwards dates", () => {
  assert.deepEqual(tripDates(undefined, "2027-04-26"), []);
  assert.deepEqual(tripDates("2027-04-22", ""), []);
  assert.deepEqual(tripDates("April 22", "2027-04-26"), []);
  assert.deepEqual(tripDates("2027-04-26", "2027-04-22"), []);
});

test("tripDates caps very long trips", () => {
  assert.equal(tripDates("2027-01-01", "2027-12-31").length, 31);
});

test("shortTripDate reads like a calendar", () => {
  assert.equal(shortTripDate("2027-04-22"), "Thu, Apr 22");
});

test("plannedRounds gives each golf day 1 or 2 rounds, numbered across the trip", () => {
  const draft = { golfDays: "3", day1Date: "2027-04-22", day1Rounds: "1", day2Date: "2027-04-23", day2Rounds: "2", day3Date: "2027-04-24", day3Rounds: "1" };
  assert.deepEqual(plannedRounds(draft), [
    { number: 1, dayNumber: 1, date: "2027-04-22" },
    { number: 2, dayNumber: 2, date: "2027-04-23" },
    { number: 3, dayNumber: 2, date: "2027-04-23" },
    { number: 4, dayNumber: 3, date: "2027-04-24" },
  ]);
});

test("plannedRounds handles a missing or bad Golf step", () => {
  assert.deepEqual(plannedRounds({}), []);
  assert.deepEqual(plannedRounds({ golfDays: "abc" }), []);
  assert.deepEqual(plannedRounds({ golfDays: "-2" }), []);
  assert.deepEqual(plannedRounds({ golfDays: "1" }), [{ number: 1, dayNumber: 1, date: "" }]);
});

test("parseGolfTripDraft survives empty or broken storage", () => {
  assert.deepEqual(parseGolfTripDraft(""), {});
  assert.deepEqual(parseGolfTripDraft("not json"), {});
  assert.deepEqual(parseGolfTripDraft("null"), {});
  assert.deepEqual(parseGolfTripDraft('{"tripName":"Maroon Masters 2027"}'), { tripName: "Maroon Masters 2027" });
});
