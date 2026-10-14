import test from "node:test";
import assert from "node:assert/strict";
import { savedTripPresentation } from "./savedTripPresentation";
import type { SavedGolfTrip } from "./golfTripCreate";

test("saved-trip presentation uses accepted real members and never invents scores or matches", () => {
  const trip = { trip: { start_date: "2026-10-14" }, rounds: [{ roundNumber: 1, playDate: "2026-10-14", courseName: "Test course" }],
    members: [{ profileId: "one", displayName: "Joined", invitationStatus: "accepted" }, { profileId: "two", displayName: "Invited", invitationStatus: "invited" }] } as SavedGolfTrip;
  const result = savedTripPresentation(trip, null, "2026-10-14");
  assert.deepEqual(result.leaderboard.map(row => row.golfer.name), ["Joined"]);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.par, []);
  assert.equal(result.leaderboard[0].total, "—");
  assert.equal(result.course, "Test course");
});
