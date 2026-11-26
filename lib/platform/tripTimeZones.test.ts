import { test } from "node:test";
import assert from "node:assert/strict";
import { isTimeZone } from "../notifications/reminders.ts";
import { isTripTimeZone, TRIP_TIME_ZONES, tripTimeZoneLabel } from "./tripTimeZones.ts";

test("every listed trip time zone is a real one, and only listed ones are accepted", () => {
  for (const zone of TRIP_TIME_ZONES) assert.equal(isTimeZone(zone.id), true, zone.id);
  assert.equal(isTripTimeZone("America/Phoenix"), true);
  assert.equal(isTripTimeZone("Asia/Tokyo"), false);
  assert.equal(tripTimeZoneLabel(null), "Central (not set)");
  assert.equal(tripTimeZoneLabel("America/Denver"), "Mountain");
});
