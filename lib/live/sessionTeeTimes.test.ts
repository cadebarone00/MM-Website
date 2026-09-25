// lib/live/sessionTeeTimes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveMatchTeeTime, formatPacificTeeTime, teeTimeSlotForMatch } from "./sessionTeeTimes.ts";

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
  const result = deriveMatchTeeTime("2027-07-15", "07:30");
  assert.equal(result?.toISOString(), "2027-07-15T14:30:00.000Z");
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PST (winter)", () => {
  const result = deriveMatchTeeTime("2027-01-06", "07:30");
  assert.equal(result?.toISOString(), "2027-01-06T15:30:00.000Z");
});

test("deriveMatchTeeTime is correct on the spring-forward transition day (2027-03-14)", () => {
  const result = deriveMatchTeeTime("2027-03-14", "07:30");
  assert.equal(result?.toISOString(), "2027-03-14T14:30:00.000Z");
  assert.equal(formatPacificTeeTime(result!), "7:30 AM PT");
});

test("deriveMatchTeeTime is correct on the fall-back transition day (2027-11-07)", () => {
  const result = deriveMatchTeeTime("2027-11-07", "07:30");
  assert.equal(result?.toISOString(), "2027-11-07T15:30:00.000Z");
  assert.equal(formatPacificTeeTime(result!), "7:30 AM PT");
});

test("deriveMatchTeeTime returns null when the date or the time of day is missing", () => {
  assert.equal(deriveMatchTeeTime(null, "07:30"), null);
  assert.equal(deriveMatchTeeTime("2027-01-06", null), null);
  assert.equal(deriveMatchTeeTime(null, null), null);
});

test("formatPacificTeeTime labels the instant in Pacific Time regardless of season", () => {
  assert.equal(formatPacificTeeTime(new Date("2027-07-15T14:30:00.000Z")), "7:30 AM PT");
  assert.equal(formatPacificTeeTime(new Date("2027-01-06T15:30:00.000Z")), "7:30 AM PT");
});
