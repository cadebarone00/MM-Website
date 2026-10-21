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

test("saved-trip presentation carries each member's profile photo, or null for initials", () => {
  const trip = { trip: { start_date: "2026-10-14" }, rounds: [{ roundNumber: 1, playDate: "2026-10-14", courseName: "Test course" }],
    members: [{ profileId: "one", displayName: "With Photo", invitationStatus: "accepted", avatarUrl: "https://example.test/one.jpg" }, { profileId: "two", displayName: "No Photo", invitationStatus: "accepted" }] } as SavedGolfTrip;
  const result = savedTripPresentation(trip, null, "2026-10-14");
  assert.deepEqual(result.leaderboard.map(row => row.golfer.avatarUrl), ["https://example.test/one.jpg", null]);
});

test("saved-trip presentation shows the round's confirmed pars for reference only (H5C Part 2)", () => {
  const trip = { trip: { start_date: "2026-10-14" }, rounds: [{ roundNumber: 1, playDate: "2026-10-14", courseName: "Test course" }],
    members: [{ profileId: "one", displayName: "Joined", invitationStatus: "accepted" }] } as SavedGolfTrip;
  const pars = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  const scoring = { roundId: "r", roundNumber: 1, groups: [], entries: [], pars: { pars, source: "course" as const, courseRef: "og-1", courseName: "Test course", tee: "Blue", confirmedBy: "Cade", confirmedAt: "2026-10-14T12:00:00Z", lockedAt: null } };
  const shown = savedTripPresentation(trip, scoring, "2026-10-14");
  assert.deepEqual(shown.par, pars);
  assert.equal(shown.parIsReference, true);
  assert.deepEqual(shown.leaderboard[0].holes, Array(18).fill(null), "no scores invented from pars");
  assert.deepEqual(savedTripPresentation(trip, { ...scoring, pars: null }, "2026-10-14").par, [], "none confirmed: no pars");
  assert.equal(savedTripPresentation(trip, null, "2026-10-14").parIsReference, true);
});
