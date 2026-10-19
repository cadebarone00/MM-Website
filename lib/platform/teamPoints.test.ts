import assert from "node:assert/strict";
import test from "node:test";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import { defaultRoundComp } from "./roundCompetition";
import { roundScoringFrom, teamPoints } from "./teamPoints";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const golfer = (name: string, thru = "") => ({ name, hcp: 0, thru, score: "", teeTime: "", course: "" });
const row = (name: string, holes: (number | null)[]) => ({ position: "1", golfer: golfer(name), total: "", thru: "", today: "", netTotal: "", netToday: "", holes });
function trip(a: (number | null)[], b: (number | null)[], roundScoring?: GolfMatchPreview["roundScoring"], extra: Partial<GolfMatchPreview> = {}): GolfMatchPreview {
  return { round: 1, roundCount: 2, course: "Test", roundDate: "2027-01-01", format: "Singles", handicap: false, par: PAR, roundScoring,
    sides: [{ name: "Maroon", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }, { name: "White", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }],
    matches: [{ round: 1, left: golfer("Ace"), right: golfer("Bo"), gross: null, net: null }],
    leaderboard: [row("Ace", a), row("Bo", b)], ...extra };
}

test("round settings come from the organizer's Format choices (key = day-slot); skipped rounds and defaults handled", () => {
  const rounds = [{ number: 1, dayNumber: 1 }, { number: 2, dayNumber: 1 }, { number: 3, dayNumber: 2 }];
  const settings = roundScoringFrom(rounds, { "0-1": { ...defaultRoundComp(8), format: "Fourball", nassau: true } }, { "1-0": false }, 8);
  assert.deepEqual(settings.map((s) => [s.round, s.nassau, s.pointsAvailable]), [[1, false, 4], [2, true, 6]], "round 1 default 4 singles, round 2 two 2v2 Nassau = 6, round 3 not a comp round");
});

test("non-Nassau: a finished match pays its points per match; available = the organizer's totals", () => {
  const won = trip(PAR.map((p) => p - 1), PAR, [{ round: 1, matchPlay: true, pointsPerMatch: 2, nassau: false, pointsAvailable: 2 }, { round: 2, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: 4 }]);
  assert.deepEqual(teamPoints(won), { points: [2, 0], available: 6 });
});

test("Nassau: front, back and overall each pay; the back nine counts even after the match is decided", () => {
  // Ace wins 1–9; Bo wins 10–14; 15–18 halved. Overall: Ace wins 4&3 on 15, but the back nine still finishes: Bo wins it.
  const a = PAR.map((p, h) => h < 9 ? p - 1 : h < 14 ? p + 1 : p), b = PAR;
  const nassau = [{ round: 1, matchPlay: true, pointsPerMatch: 1, nassau: true, pointsAvailable: 3 }];
  assert.deepEqual(teamPoints(trip(a, b, nassau)), { points: [2, 1], available: 3 }, "Ace: front + overall; Bo: back");
  // Ace wins the front, Bo the whole back: the overall is all square.
  assert.deepEqual(teamPoints(trip(PAR.map((p, h) => h < 9 ? p - 1 : p + 1), b, nassau))?.points, [1.5, 1.5]);
  // Halved overall: front Ace, back Bo, overall square.
  const level = PAR.map((p, h) => h < 3 ? p - 1 : h >= 9 && h < 12 ? p + 1 : p);
  assert.deepEqual(teamPoints(trip(level, PAR, nassau))?.points, [1.5, 1.5]);
});

test("stroke play rounds pay no match points; no settings and no matches = nothing to show", () => {
  const stroke = trip(PAR.map((p) => p - 1), PAR, [{ round: 1, matchPlay: false, pointsPerMatch: 1, nassau: false, pointsAvailable: 0 }]);
  assert.deepEqual(teamPoints(stroke), { points: [0, 0], available: 0 });
  assert.equal(teamPoints(trip([], [], undefined, { matches: [] })), null);
});
