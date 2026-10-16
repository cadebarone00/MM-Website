import test from "node:test";
import assert from "node:assert/strict";
import { historicalTripStandings, standingsFormat } from "./historicalTripStandings";
import { tournamentSessions } from "./tournamentToGolfTrip";
import { palmSprings2026 } from "../data/2026-palm-springs";
import { scorecards2026 } from "../data/scorecards-2026";
import { getPlayerDisplayName } from "../data/players";

test("2026 snapshots map six individual cards into eight sessions and carry alternate-shot standings", () => {
 const snapshots = historicalTripStandings(palmSprings2026, scorecards2026, tournamentSessions(palmSprings2026));
 assert.equal(snapshots.length, 8);
 for (const round of snapshots) assert.equal(round.leaderboard.length, 12);
 const player = (round: number, slug: string) => snapshots[round-1].leaderboard.find(r => r.golfer.name === getPlayerDisplayName(slug))!;
 assert.equal(player(1, "cade-barone").total, "+5");
 assert.equal(player(2, "cade-barone").total, "+5");
 assert.deepEqual(player(2, "cade-barone"), player(1, "cade-barone"));
 assert.equal(snapshots[1].standingsRound, 1);
 assert.deepEqual(snapshots[5].leaderboard, snapshots[4].leaderboard);
 assert.equal(snapshots[5].standingsRound, 5);
 assert.equal(player(3, "cade-barone").total, "-1");
 assert.equal(player(6, "cade-barone").total, player(5, "cade-barone").total);
 assert.deepEqual(player(8, "cade-barone").holes, scorecards2026.find(c => c.player === "cade-barone")!.rounds[5].holes.map(h => h.score));
 for (const standing of palmSprings2026.individualLeaderboard) {
  assert.equal(Number(player(8, standing.player).total), standing.toPar);
 }
 assert.equal(player(1, "collin-ross").position, player(1, "hugo-moebel").position);
});

test("shared-ball notices cover Chapman, Scramble and Alternate Shot but not Fourball", () => {
 for (const format of ["Chapman", "Scramble", "Alternate Shot"]) assert.deepEqual(standingsFormat(format), { label: format, sharedBall: true });
 assert.equal(standingsFormat("Fourball").sharedBall, false);
});
