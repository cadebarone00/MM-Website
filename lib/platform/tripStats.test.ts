import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { tripStats } from "./tripStats.ts";

const par = Array.from({ length: 18 }, (_, i) => (i < 4 ? 3 : 4)); // 4 par 3s → 14 fairway holes
const round = (id: string, profileId: string, strokes: number, extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id, profileId, source: "trip", tripId: "t1", tripRoundId: "round-1", datePlayed: "2027-04-12", course: { ref: null, name: "Pine", place: "" }, tee: null,
  holesPlayed: 18, format: "Stroke play", enteredBy: "player",
  holes: par.map((p, i) => ({ number: i + 1, par: p, strokes, putts: 2, fairway: p === 3 ? null : i % 2 ? "center" : "left", green: i < 9 ? "center" : "right" })), ...extra,
});

test("per-player averages and percentages, best scoring average first, plus a trip row", () => {
  const stats = tripStats([round("a", "jake", 5), round("b", "cade", 4), round("c", "cade", 5)], "t1");
  assert.deepEqual(stats.players.map((p) => [p.profileId, p.rounds, p.scoringAvg]), [["cade", 2, 81], ["jake", 1, 90]]);
  assert.equal(stats.players[0].puttsAvg, 36);
  assert.equal(stats.players[0].fairwayPct, 50);  // 7 of 14
  assert.equal(stats.players[0].greenPct, 50);    // 9 of 18
  assert.deepEqual(stats.trip, { rounds: 3, scoringAvg: 84, puttsAvg: 36, fairwayPct: 50, greenPct: 50 });
});

test("only this trip's rounds; a round removed from a profile still counts for the trip", () => {
  const stats = tripStats([round("a", "jake", 4, { removedFromProfile: true }), round("x", "jake", 4, { tripId: "other" }), round("p", "jake", 4, { source: "personal", tripId: undefined })], "t1");
  assert.equal(stats.players[0].rounds, 1);
});

test("no rounds yet → no rows and no trip row", () => assert.deepEqual(tripStats([], "t1"), { players: [], trip: null }));

test("missing stats show as null, not 0", () => {
  const blank = buildPlayerRound({ ...round("a", "jake", 4), holes: par.map((p, i) => ({ number: i + 1, par: p, strokes: 4, putts: null, fairway: null, green: null })) });
  const row = tripStats([blank], "t1").players[0];
  assert.deepEqual([row.puttsAvg, row.fairwayPct, row.greenPct], [null, null, null]);
});
