import test from "node:test";
import assert from "node:assert/strict";
import { scorecards2026 } from "@/lib/data/scorecards-2026";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { getPlayerDisplayName } from "@/lib/data/players";
import { historicalTripStandings } from "@/lib/platform/historicalTripStandings";
import { adaptTournamentToPreviewMatch, tournamentSessions } from "@/lib/platform/tournamentToGolfTrip";
import { seedDevRounds } from "./devPlayerRounds";
import { devTripScoring } from "./devTripScores";
import { scorecardTripRounds } from "./scorecardTripRounds";

const match = { ...adaptTournamentToPreviewMatch(palmSprings2026), devTripId: "history-test",
  roundStandings: historicalTripStandings(palmSprings2026, scorecards2026, tournamentSessions(palmSprings2026)) };

test("historical stats use exact stored card strokes, putts, fairway and green hits without double-counting shared-ball sessions", () => {
  const rounds = scorecardTripRounds(match, name => name);
  assert.equal(rounds.length, scorecards2026.reduce((sum, c) => sum + c.rounds.length, 0));
  for (const card of scorecards2026) {
    const imported = rounds.filter(r => r.profileId === getPlayerDisplayName(card.player));
    card.rounds.forEach((source, i) => {
      const round = imported[i];
      assert.equal(round.total, source.holes.reduce((sum, h) => sum + h.score, 0));
      assert.deepEqual(round.holes.map(h => h.putts), source.holes.map(h => h.putts));
      assert.equal(round.holes.filter(h => h.fairway === "center").length, source.holes.filter(h => h.par !== 3 && h.fir === 1).length);
      assert.equal(round.holes.filter(h => h.green === "center").length, source.holes.filter(h => h.gir === 1).length);
    });
  }
});

test("saved player scoring replaces its imported card in both statistics and leaderboard scorecards", () => {
  const sourceBefore = JSON.stringify(match);
  const initial = devTripScoring(seedDevRounds(), match, "dev-cade");
  const original = initial.tripStats.rounds[0];
  const holes = original.holes.map(h => ({ ...h, strokes: h.strokes + 1, fairway: null, green: null, putts: null }));
  const updated = { ...original, holes, total: original.total + 18 };
  const result = devTripScoring({ ...seedDevRounds(), rounds: [updated] }, match, "dev-cade");
  assert.equal(result.tripStats.rounds.length, initial.tripStats.rounds.length);
  assert.deepEqual(result.tripStats.rounds.find(r => r.id === updated.id)?.holes, holes);
  const row = result.shownMatch!.roundStandings![0].leaderboard.find(row => row.golfer.name === initial.tripStats.players.find(p => p.profileId === original.profileId)!.name)!;
  assert.deepEqual(row.holes, holes.map(h => h.strokes));
  assert.deepEqual(row.holeDetails, holes);
  assert.equal(result.tripStats.players.find(p => p.profileId === original.profileId)!.scoringAvg,
    Math.round(result.tripStats.rounds.filter(r => r.profileId === original.profileId).reduce((sum, r) => sum + r.total, 0) / 6 * 10) / 10);
  assert.equal(JSON.stringify(match), sourceBefore);
});
