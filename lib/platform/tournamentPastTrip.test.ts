import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptTournamentToPastTrip } from "./tournamentToGolfTrip.ts";
import { danzante2025 } from "../data/2025-danzante.ts";

test("a past Maroon tournament becomes a History entry from the real data (no made-up rounds)", () => {
  const trip = adaptTournamentToPastTrip(danzante2025);
  assert.equal(trip.name, "The Maroon Tournament 2025");
  assert.equal(trip.arrival, "2025-01-07");
  assert.equal(trip.departure, "2025-01-12");
  assert.equal(trip.place, "Loreto, MX");
  assert.equal(trip.players.length, 8);
  assert.deepEqual(trip.rounds, []);
  assert.ok(trip.championOverride);
});
