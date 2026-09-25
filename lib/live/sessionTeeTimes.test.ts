// lib/live/sessionTeeTimes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveMatchTeeTime, formatTeeTimeInZone, teeTimeSlotForMatch } from "./sessionTeeTimes.ts";

const PACIFIC = "America/Los_Angeles";
const CENTRAL = "America/Chicago";

test("teeTimeSlotForMatch: Fourball/Foursome map each match 1:1 to a slot", () => {
  assert.equal(teeTimeSlotForMatch("Fourball", 1), 0);
  assert.equal(teeTimeSlotForMatch("Fourball", 2), 1);
  assert.equal(teeTimeSlotForMatch("Fourball", 3), 2);
  assert.equal(teeTimeSlotForMatch("Foursome", 1), 0);
  assert.equal(teeTimeSlotForMatch("Foursome", 3), 2);
});

test("teeTimeSlotForMatch: Singles pairs two matches per slot", () => {
  assert.equal(teeTimeSlotForMatch("Singles", 1), 0);
  assert.equal(teeTimeSlotForMatch("Singles", 2), 0);
  assert.equal(teeTimeSlotForMatch("Singles", 3), 1);
  assert.equal(teeTimeSlotForMatch("Singles", 4), 1);
  assert.equal(teeTimeSlotForMatch("Singles", 5), 2);
  assert.equal(teeTimeSlotForMatch("Singles", 6), 2);
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PDT (summer)", () => {
  const result = deriveMatchTeeTime("2027-07-15", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-07-15T14:30:00.000Z");
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PST (winter)", () => {
  const result = deriveMatchTeeTime("2027-01-06", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-01-06T15:30:00.000Z");
});

test("deriveMatchTeeTime is correct on the spring-forward transition day (2027-03-14)", () => {
  const result = deriveMatchTeeTime("2027-03-14", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-03-14T14:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, PACIFIC), "7:30 AM PDT");
});

test("deriveMatchTeeTime is correct on the fall-back transition day (2027-11-07)", () => {
  const result = deriveMatchTeeTime("2027-11-07", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-11-07T15:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, PACIFIC), "7:30 AM PST");
});

test("deriveMatchTeeTime returns null when the date or the time of day is missing", () => {
  assert.equal(deriveMatchTeeTime(null, "07:30", PACIFIC), null);
  assert.equal(deriveMatchTeeTime("2027-01-06", null, PACIFIC), null);
  assert.equal(deriveMatchTeeTime(null, null, PACIFIC), null);
});

test("deriveMatchTeeTime works for a non-Pacific zone (proves the parameter is actually used, not a renamed constant)", () => {
  // 7:30 AM Central (summer, CDT = UTC-5) is 12:30 UTC.
  const result = deriveMatchTeeTime("2027-07-15", "07:30", CENTRAL);
  assert.equal(result?.toISOString(), "2027-07-15T12:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, CENTRAL), "7:30 AM CDT");
});

test("formatTeeTimeInZone labels the instant in whichever zone is passed, regardless of season", () => {
  assert.equal(formatTeeTimeInZone(new Date("2027-07-15T14:30:00.000Z"), PACIFIC), "7:30 AM PDT");
  assert.equal(formatTeeTimeInZone(new Date("2027-01-06T15:30:00.000Z"), PACIFIC), "7:30 AM PST");
});
