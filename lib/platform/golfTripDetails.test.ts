import { test } from "node:test";
import assert from "node:assert/strict";
import { flightPlanFromTravel, golfTripDetailsFromBody, travelFromFlightPlan } from "./golfTripDetails.ts";

const BASE = { tripName: " Maroon Masters 2027 ", destination: "Pinehurst, NC", travelMode: "flying" };

test("trip details: a good change is trimmed and travel becomes the flight plan answer", () => {
  const result = golfTripDetailsFromBody(BASE);
  assert.ok(result.ok);
  assert.deepEqual(result.details, { name: "Maroon Masters 2027", destination: "Pinehurst, NC", latitude: null, longitude: null, externalPlaceId: null, flightPlan: "yes" });
});

test("trip details: a picked place keeps its coordinates; a bad one is dropped, never an error", () => {
  const picked = golfTripDetailsFromBody({ ...BASE, destinationPlaceId: "abc_123", destinationLatitude: "35.19", destinationLongitude: "-79.47" });
  assert.ok(picked.ok);
  assert.equal(picked.details.latitude, 35.19);
  assert.equal(picked.details.externalPlaceId, "abc_123");
  const bad = golfTripDetailsFromBody({ ...BASE, destinationPlaceId: "abc", destinationLatitude: "200", destinationLongitude: "1" });
  assert.ok(bad.ok);
  assert.equal(bad.details.latitude, null);
});

test("trip details: missing, too long or wrong fields are errors", () => {
  const result = golfTripDetailsFromBody({ tripName: "", destination: "x".repeat(201), travelMode: "boat" });
  assert.equal(result.ok, false);
  assert.deepEqual(!result.ok && result.errors.map(error => error.field), ["tripName", "destination", "travelMode"]);
  assert.equal(golfTripDetailsFromBody(null).ok, false);
  assert.equal(golfTripDetailsFromBody(["x"]).ok, false);
  assert.equal(golfTripDetailsFromBody({ ...BASE, tripName: 5 }).ok, false);
});

test("trip details: travel and flight plan answers map both ways", () => {
  for (const mode of ["flying", "driving", "mix"] as const) assert.equal(travelFromFlightPlan(flightPlanFromTravel(mode)), mode);
});
