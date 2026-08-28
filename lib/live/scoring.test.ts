import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveTournamentSnapshot } from "./types.ts";
import { leaderboard, summarizePlayer, updateScore } from "./scoring.ts";

const SEED_HOLES = [
  { number: 1, par: 4, yards: 388 },
  { number: 2, par: 4, yards: 355 },
  { number: 3, par: 4, yards: 382 },
  { number: 4, par: 3, yards: 162 },
  { number: 5, par: 5, yards: 517 },
];

function seedSnapshot(): LiveTournamentSnapshot {
  return {
    players: { cade: { team: "maroon" }, cam: { team: "white" } },
    courses: { c1: { id: "c1", name: "2027 Maroon Masters", holes: SEED_HOLES } },
    roundCourses: { 1: "c1" },
    scores: new Map(),
    matchBoxes: [],
  };
}

test("leaderboard uses score minus par", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 1, 3, 1, true, true);
  updateScore(snapshot, "cam", 1, 1, 5, 2, false, false);

  const leaders = leaderboard(snapshot);

  assert.equal(leaders[0].player, "cade");
  assert.equal(leaders[0].toPar, -1);
  assert.equal(leaders[leaders.length - 1].player, "cam");
  assert.equal(leaders[leaders.length - 1].toPar, 1);
});

test("par-three FIR is not counted", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 4, 3, 2, true, true);

  const summary = summarizePlayer(snapshot, "cade");

  assert.equal(summary.firTotal, 0);
  assert.equal(summary.girTotal, 1);
  assert.equal(summary.girHit, 1);
});

test("updateScore is idempotent per player/round/hole", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 1, 5, 2, true, true);
  updateScore(snapshot, "cade", 1, 1, 3, 1, true, true);

  const summary = summarizePlayer(snapshot, "cade");

  assert.equal(summary.gross, 3, "second call for the same hole should overwrite, not add a second entry");
});

test("summarizePlayer throws for an unknown player", () => {
  const snapshot = seedSnapshot();
  assert.throws(() => summarizePlayer(snapshot, "nobody"), /Unknown player/);
});
