import { test } from "node:test";
import assert from "node:assert/strict";
import { spectatorTournament, spectatorTrip } from "./watchView.ts";
import type { CodeTournament } from "./codeTournaments.ts";
import type { SavedGolfTrip } from "./golfTripCreate.ts";

const CAM = "11111111-1111-4111-8111-111111111111", CADE = "22222222-2222-4222-8222-222222222222", TRIP = "33333333-3333-4333-8333-333333333333";

test("a watched tournament keeps names, usernames and scores but no profile ids, join code or organizer", () => {
  const t: CodeTournament = { id: "t", code: "K7Q4MZ", name: "Member-Guest", organizer: CAM, organizerPlays: true, scoring: "Gross", status: "live", createdAt: "",
    rounds: [{ number: 1, setup: { course: { ref: "c", name: "Pine", place: "", par: [4] }, tee: null }, date: "2026-11-01" }],
    players: [{ profileId: CAM, name: "Cam Latto", username: "cam", handicap: 3 }, { profileId: CADE, name: "Cade Barone", username: "cade", handicap: null }],
    holes: [{ profileId: CADE, round: 1, hole: 1, strokes: 5 }], cards: [{ profileId: CADE, round: 1, submittedAt: "x" }] };
  const shown = spectatorTournament(t);
  const text = JSON.stringify(shown);
  for (const secret of [CAM, CADE, "K7Q4MZ"]) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.players.map((p) => [p.profileId, p.name, p.username]), [["p1", "Cam Latto", "cam"], ["p2", "Cade Barone", "cade"]], "usernames stay so a name opens the profile");
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
  for (const secret of [CAM, CADE, TRIP, "example.com", "Invited Ike", "Pinehurst, NC", "35.2"]) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.savedTrip.members.map((m) => [m.profileId, m.displayName, m.avatarUrl ?? null, m.username]), [["p1", "Cam Latto", "https://x/cam.webp", "cam"], ["p2", "Cade Barone", null, "cade"]]);
  assert.equal(shown.savedTrip.trip.id, "watch-W4K9PZ");
  assert.equal(shown.draft.round1Course, "Pinehurst No. 2");
  assert.equal(shown.draft.tripName, "Pinehurst");
  assert.deepEqual((shown.scoring as unknown as { entries: { scoredProfileId: string }[] }).entries[0].scoredProfileId, "p2");
});

test("a watched league keeps names, handicaps, groups and scores but no ids, join code, organizer or tee times", async () => {
  const { spectatorLeague } = await import("./watchView.ts");
  const league = {
    id: "dddddddd-0000-4000-8000-000000000009", code: "K7Q4MZ", name: "Thursday", organizer: CAM, date: "2026-11-21", status: "live" as const,
    course: { name: "Stevens Park", place: null, par: Array(18).fill(4), strokeIndex: null, tee: null }, scoring: "Gross" as const,
    players: [{ profileId: CAM, name: "Cam Latto", handicap: 3 }, { profileId: CADE, name: "Cade Barone", handicap: null }],
    groups: [{ number: 1, time: "08:10", hole: 10, scorer: CAM, players: [CAM, CADE], submitted: false }],
    skins: { on: true, net: false, carryover: true }, pairs: { on: true, format: "bestball" as const, net: false, segments: 18 as const, rule: "random" as const, locked: true, teams: [[CAM, CADE]] },
    holes: [{ profileId: CADE, hole: 1, strokes: 5 }], watchCode: "W4K9PZ",
  };
  const shown = spectatorLeague(league, "watch-W4K9PZ");
  const text = JSON.stringify(shown);
  for (const secret of [CAM, CADE, "K7Q4MZ", "08:10", league.id]) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual(shown.players.map((p) => [p.profileId, p.name, p.handicap]), [["p1", "Cam Latto", 3], ["p2", "Cade Barone", null]]);
  assert.deepEqual(shown.groups[0].players, ["p1", "p2"]);
  assert.deepEqual(shown.pairs.teams, [["p1", "p2"]]);
  assert.deepEqual(shown.holes, [{ profileId: "p2", hole: 1, strokes: 5 }]);
  assert.equal(shown.organizer, "");
  assert.equal(shown.id, "watch-W4K9PZ");
  assert.equal("watchCode" in shown, false, "the share code itself isn't sent back");
});
