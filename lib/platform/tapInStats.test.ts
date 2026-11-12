import { test } from "node:test";
import assert from "node:assert/strict";
import { spectatorTrip } from "./watchView";
import { tapInStats } from "./tapInStats";
import type { SavedGolfTrip } from "./golfTripCreate";
import type { TripRoundScoring } from "./tripScoring";
import type { TripSetupSnapshot } from "./savedTripSetup";

const trip: SavedGolfTrip = {
  trip: { id: "private-trip-id", name: "Tap In Trip", destination: "Private hotel", start_date: "2026-11-12", end_date: "2026-11-13", expected_traveler_count: 2,
    golf_days: 1, planned_rounds: 1, includes_tournament: "yes", lodging_plan: "yes", flight_plan: "yes", transportation_plan: "yes", tournament_id: null, status: "active", created_by: "private-profile-id", watch_code: "W4K9PZ" },
  members: [{ id: "private-member-id", profileId: "private-profile-id", displayName: "Alex", email: "private@example.com", role: "organizer", invitationStatus: "accepted" }],
  rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2026-11-12", courseName: "Golf course" }],
};
const scoring: TripRoundScoring = { roundId: "private-round-id", roundNumber: 1,
  pars: { pars: Array(18).fill(4), source: "manual", courseRef: null, courseName: "Golf course", tee: null, confirmedBy: "Private organizer", confirmedAt: null, lockedAt: null },
  groups: [{ id: "private-group-id", groupNumber: 1, lockedAt: null, players: [{ profileId: "private-profile-id", displayName: "Alex", playOrder: 1, side: "left", attesterProfileId: null, submittedAt: "2026-11-12T18:00:00Z" }] }],
  entries: Array.from({ length: 18 }, (_, index) => ({ scoredProfileId: "private-profile-id", enteredByProfileId: "private-profile-id", hole: index + 1, strokes: 4,
    putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "private-timestamp", version: 1 })),
};
const setup: TripSetupSnapshot = { available: true, revision: 10, basis: { startDate: "2026-11-12", endDate: "2026-11-13", rounds: trip.rounds }, values: {
  teamNames: ["Maroon", "White"], localCompetitionType: { team: "2 Teams", individual: "Stroke Play", secret: "private@example.com" },
  compFormats: { "0-0": { format: "Singles", scoring: "Gross", secret: "private@example.com" } },
  teeTimes: { "0-0": "Private tee time" }, pickedCourses: { privateLocation: "Private hotel" }, pastTrips: ["private@example.com"], organizerNote: "private@example.com",
} };

test("Tap In public boundary drops private setup fields, raw ids and score-entry metadata", () => {
  const shown = spectatorTrip(trip, scoring, setup, "watch-W4K9PZ");
  const text = JSON.stringify(shown);
  for (const secret of ["private@example.com", "private-profile-id", "private-trip-id", "private-round-id", "private-group-id", "Private hotel", "Private tee time", "Private organizer", "private-timestamp", '"watch_code"'])
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.setup.values.compFormats, { "0-0": { format: "Singles", scoring: "Gross" } });
  assert.deepEqual(shown.setup.values.localCompetitionType, { individual: "Stroke Play", team: "2 Teams" });
});
test("Tap In stats reuse recorded submitted cards and preserve missing optional stats", () => {
  const shown = spectatorTrip(trip, scoring, setup, "watch-W4K9PZ");
  const stats = tapInStats(shown);
  assert.equal(stats.players[0].name, "Alex");
  assert.equal(stats.players[0].profileId, "p1");
  assert.equal(stats.trip?.scoringAvg, 72);
  assert.equal(stats.trip?.puttsAvg, null);
  assert.equal(stats.trip?.fairwayPct, null);
  assert.equal(stats.rounds?.length, 1);
});
test("missing pars, incomplete cards and unsubmitted cards produce no invented stats", () => {
  const shown = spectatorTrip(trip, scoring, setup, "watch-W4K9PZ");
  assert.equal(tapInStats({ ...shown, scoring: { ...shown.scoring!, pars: null } }).trip, null);
  assert.equal(tapInStats({ ...shown, scoring: { ...shown.scoring!, entries: shown.scoring!.entries.slice(1) } }).trip, null);
  assert.equal(tapInStats({ ...shown, scoring: { ...shown.scoring!, groups: [] } }).trip, null);
});
