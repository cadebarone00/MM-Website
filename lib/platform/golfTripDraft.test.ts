import assert from "node:assert/strict";
import test from "node:test";
import { parseGolfTripDraft, plannedRounds, reviewRows, shortTripDate, tripDates } from "./golfTripDraft";

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

test("reviewRows lists every answer top to bottom", () => {
  const rows = reviewRows({
    tripName: "Maroon Masters 2027", destination: "Pinehurst, North Carolina", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com",
    golfDays: "2", day1Date: "2027-04-23", day1Rounds: "2", day2Date: "2027-04-24", day2Rounds: "1",
    round1Course: "Pinehurst No. 2", round2Course: "", round3Course: "Pinehurst No. 4",
    includesTournament: "yes", knowsLodging: "no", knowsFlights: "undecided", knowsTransportation: "yes",
  });
  assert.deepEqual(rows, [
    { label: "Trip Name", value: "Maroon Masters 2027" },
    { label: "Destination", value: "Pinehurst, North Carolina" },
    { label: "Dates", value: "Thu, Apr 22 – Mon, Apr 26" },
    { label: "Players", value: "8" },
    { label: "Golf Days", value: "2" },
    { label: "Rounds", value: "3" },
    { label: "Round 1", value: "Fri, Apr 23 · Pinehurst No. 2" },
    { label: "Round 2", value: "Fri, Apr 23 · Course not set" },
    { label: "Round 3", value: "Sat, Apr 24 · Pinehurst No. 4" },
    { label: "Tournament", value: "Yes" },
    { label: "Lodging", value: "No" },
    { label: "Flights", value: "Not sure yet" },
    { label: "Transportation", value: "Yes" },
  ]);
});

test("reviewRows shows Not set for anything skipped", () => {
  const rows = reviewRows({});
  assert.equal(rows.length, 10);
  assert.ok(rows.every((row) => row.value === "Not set"));
  assert.equal(reviewRows({ startDate: "2027-04-22", endDate: "2027-04-22" })[2].value, "Thu, Apr 22");
});
