import { test } from "node:test";
import assert from "node:assert/strict";
import { applyJustCreatedSetup } from "./justCreatedTrip.ts";
import { simulatorTripData } from "./golfTripSimulatorData.ts";
import { DEFAULT_SIMULATOR_STATE } from "./simulator.ts";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";
import { defaultRoundComp } from "@/lib/platform/roundCompetition";

const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
const justCreated = simulatorTripData(mock, mock, { source: "empty", state: DEFAULT_SIMULATOR_STATE });

test("nothing set up yet: the onboarding trip, unchanged in days, rounds and courses", () => {
  const trip = applyJustCreatedSetup(justCreated, {});
  assert.equal(trip.preview?.golfDays, "3");
  assert.equal(trip.preview?.endDate, "2027-05-16");
  assert.equal(trip.preview?.day2Rounds, "2");
  assert.equal(trip.preview?.round2Course, "True Blue Golf Club");
  assert.equal(trip.previewMatch?.leaderboard.length, 12);
  assert.equal(trip.previewMatch?.leaderboard[0].golfer.name, "Jordan Lee");
});

test("a Settings setup shows across the trip: rounds, courses, formats, my tee times, players and teams", () => {
  const trip = applyJustCreatedSetup(justCreated, {
    roundsPerDay: { 0: 2, 1: 1, 2: 1 },
    pickedCourses: { "0-1": { ref: "x", name: "Sharks Tooth GC", place: "Myrtle Beach, SC", par: 72 } },
    compFormats: { "0-0": { ...defaultRoundComp(12), format: "Fourball" } },
    teeTimes: { "0-0": ["08:00", "08:10"], "1-0": ["09:00"] },
    teePlayers: { "0-0": { 1: [0, 3] }, "1-0": { 0: [5, 6] } },
    playerTotal: 8,
    teamNames: ["Sharks", ""],
    submittedTeams: [[0, 1, 2, 3], [4, 5, 6, 7]],
  });
  assert.equal(trip.preview?.day1Rounds, "2");
  assert.equal(trip.preview?.round2Course, "Sharks Tooth GC");
  assert.equal(trip.preview?.round1Format, "Fourball");
  assert.equal(trip.previewMatch?.formatDef?.label, "Fourball");
  // Only the tee time of the group I'm in (round 1, group 2); round 2's group doesn't have me.
  assert.deepEqual(trip.travel?.items.filter(item => item.kind === "teeTime").map(item => item.startsAt), ["2027-05-13T08:10"]);
  assert.equal(trip.previewMatch?.leaderboard.length, 8);
  assert.equal(trip.previewMatch?.matches.length, 4);
  const first = trip.previewMatch?.matches[0];
  assert.equal(first && "name" in first.left ? first.left.name : undefined, "Sharks");
});

test("golf off on arrival day moves the golf days one day later", () => {
  const trip = applyJustCreatedSetup(justCreated, { golfOnArrival: false, dayCount: 4 });
  assert.equal(trip.preview?.startDate, "2027-05-13");
  assert.equal(trip.preview?.day1Date, "2027-05-14");
  assert.equal(trip.preview?.golfDays, "3");
});
