import { test } from "node:test";
import assert from "node:assert/strict";
import { spectatorTournament, spectatorTrip } from "./watchView.ts";
import type { CodeTournament } from "./codeTournaments.ts";
import type { SavedGolfTrip } from "./golfTripCreate.ts";

const CAM = "11111111-1111-4111-8111-111111111111", CADE = "22222222-2222-4222-8222-222222222222", TRIP = "33333333-3333-4333-8333-333333333333";

test("a watched tournament keeps names and scores but no profile ids, join code, organizer or usernames", () => {
  const t: CodeTournament = { id: "t", code: "K7Q4MZ", name: "Member-Guest", organizer: CAM, organizerPlays: true, scoring: "Gross", status: "live", createdAt: "",
    rounds: [{ number: 1, setup: { course: { ref: "c", name: "Pine", place: "", par: [4] }, tee: null }, date: "2026-11-01" }],
    players: [{ profileId: CAM, name: "Cam Latto", username: "cam", handicap: 3 }, { profileId: CADE, name: "Cade Barone", username: "cade", handicap: null }],
    holes: [{ profileId: CADE, round: 1, hole: 1, strokes: 5 }], cards: [{ profileId: CADE, round: 1, submittedAt: "x" }] };
  const shown = spectatorTournament(t);
  const text = JSON.stringify(shown);
  for (const secret of [CAM, CADE, "K7Q4MZ", '"cam"', '"cade"']) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.players.map((p) => [p.profileId, p.name]), [["p1", "Cam Latto"], ["p2", "Cade Barone"]]);
  assert.deepEqual(shown.holes, [{ profileId: "p2", round: 1, hole: 1, strokes: 5 }], "scores still line up with their player");
});

test("a watched trip drops pending invites, emails, destination, coordinates and travel plans, and swaps every id", () => {
  const trip: SavedGolfTrip = {
    trip: { id: TRIP, name: "Pinehurst", destination: "Pinehurst, NC", start_date: "2027-04-22", end_date: "2027-04-26", expected_traveler_count: 8, golf_days: 1, planned_rounds: 1,
      includes_tournament: "yes", lodging_plan: "yes", flight_plan: "yes", transportation_plan: "no", tournament_id: null, status: "upcoming", created_by: CAM, latitude: 35.2, longitude: -79.4 },
    members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", profileId: CAM, displayName: "Cam Latto", email: "cam@example.com", role: "organizer", invitationStatus: "accepted", username: "cam", avatarUrl: "https://x/cam.webp" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", profileId: CADE, displayName: "Cade Barone", email: "cade@example.com", role: "member", invitationStatus: "accepted", username: "cade" },
      { id: "aaaaaaaa-0000-4000-8000-000000000003", profileId: null, displayName: "Invited Ike", email: "ike@example.com", role: "member", invitationStatus: "pending" },
    ],
    rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2027-04-23", courseName: "Pinehurst No. 2" }],
  };
  const scoring = { roundId: "r1", roundNumber: 1, groups: [{ groupId: "g1", players: [{ profileId: CAM }, { profileId: CADE }] }],
    entries: [{ scoredProfileId: CADE, enteredByProfileId: CADE, hole: 1, strokes: 4 }] } as never;
  const shown = spectatorTrip(trip, scoring, { values: { teamNames: ["A", "B"], organizerNote: CAM }, available: true } as never, "watch-W4K9PZ");
  const text = JSON.stringify(shown);
  for (const secret of [CAM, CADE, TRIP, "example.com", "Invited Ike", "Pinehurst, NC", "35.2", '"cam"', '"cade"']) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.savedTrip.members.map((m) => [m.profileId, m.displayName, m.avatarUrl ?? null]), [["p1", "Cam Latto", "https://x/cam.webp"], ["p2", "Cade Barone", null]]);
  assert.equal(shown.savedTrip.trip.id, "watch-W4K9PZ");
  assert.equal(shown.draft.round1Course, "Pinehurst No. 2");
  assert.equal(shown.draft.tripName, "Pinehurst");
  assert.deepEqual((shown.scoring as unknown as { entries: { scoredProfileId: string }[] }).entries[0].scoredProfileId, "p2");
});
