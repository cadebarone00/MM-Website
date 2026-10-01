import assert from "node:assert/strict";
import test from "node:test";
import { shortTripDate, tripDates } from "./golfTripDraft";

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
