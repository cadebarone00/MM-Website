import test from "node:test";
import assert from "node:assert/strict";
import { playerProfilePayload } from "./playerProfile";
import { matchProfileScorecard } from "./matchProfile";
import type { LiveTournamentSnapshot } from "./types";

test("player and match profiles share confirmed round identity, exclude shared rounds, and keep unplayed holes empty", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: 4, yards: 400 }));
  const snapshot: LiveTournamentSnapshot = { players: { cade: { team: "maroon" }, collin: { team: "white" } },
    courses: { course: { id: "course", name: "Palmer", holes, rating: 72, slope: 113 } }, roundCourses: { 2: "course", 3: "course" },
    matchBoxes: [2, 3].map(round => ({ id: `match-${round}`, seasonYear: 2027, session: round, matchNumber: 1,
      format: round === 2 ? "Foursome" : "Singles", teeTime: new Date("2027-01-01T12:00:00Z"), maroonPlayers: ["cade"], whitePlayers: ["collin"], state: "Live", started: true })),
    scores: new Map([2, 3].map(round => [`cade:${round}:1`, { seasonYear: 2027, player: "cade", round, hole: 1, score: 3, putts: 1, fir: true, gir: true, hostEdited: false }])) };
  const payload = playerProfilePayload(snapshot, "cade");
  const rounds = payload.scorecards![0].rounds;
  assert.deepEqual(rounds.map(round => round.round), [3]);
  assert.equal(rounds[0].holes[0].score, matchProfileScorecard(snapshot, "match-3")!.holes[0].scores.cade);
  assert.equal(rounds[0].holes[1].score, 0);
  assert.equal(matchProfileScorecard(snapshot, "match-3")!.holes[1].scores.cade, null);
  assert.equal(rounds[0].toPar, -1);
  assert.equal(payload.individualLeaderboard![0].toPar, -1);
  assert.equal(payload.matches![1].id, "match-3");
  assert.deepEqual(playerProfilePayload({ ...snapshot, scores: new Map() }, "cade").scorecards![0].rounds, []);
});
