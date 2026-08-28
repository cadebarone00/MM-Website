import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatchBox, LiveTournamentSnapshot } from "./types.ts";
import { updateScore } from "./scoring.ts";
import { effectiveMatchState, matchBoxResult, sessionIsComplete, thruLabel } from "./orchestration.ts";

const SEED_HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i === 3 || i === 5 || i === 12 ? 3 : i === 4 || i === 7 || i === 13 || i === 17 ? 5 : 4, yards: 400 }));

function seedSnapshot(): LiveTournamentSnapshot {
  return {
    players: Object.fromEntries(
      ["cam", "drew", "cade", "collin", "hugo", "luke", "dalton", "jackson", "nate", "pete", "kyle", "quez"].map((p, i) => [
        p,
        { team: i % 2 === 0 ? "maroon" : "white" },
      ])
    ),
    courses: { c1: { id: "c1", name: "2027 Maroon Masters", holes: SEED_HOLES } },
    roundCourses: { 1: "c1" },
    scores: new Map(),
    matchBoxes: [],
  };
}

function box(day: number, boxNumber: number, maroon: string[], white: string[]): LiveMatchBox {
  return {
    id: null,
    tournamentYear: 2027,
    day,
    session: "Morning",
    boxNumber,
    format: "Fourball",
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    maroonPlayers: maroon,
    whitePlayers: white,
    state: "Scheduled",
    started: false,
  };
}

test("session complete requires three boxes and all twelve players", () => {
  const snapshot = seedSnapshot();
  snapshot.matchBoxes = [
    box(1, 1, ["cam", "drew"], ["cade", "collin"]),
    box(1, 2, ["hugo", "luke"], ["dalton", "jackson"]),
    box(1, 3, ["nate", "pete"], ["kyle", "quez"]),
  ];

  assert.equal(sessionIsComplete(snapshot, 1, "Morning"), true);
});

test("match state moves from scheduled to armed to live", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);

  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T10:00:00-06:00")), "Scheduled");

  matchBox.started = true;
  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:00:00-06:00")), "Armed");
  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:30:00-06:00")), "Live");
});

test("thru label never displays Thru 18", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  matchBox.started = true;
  const round = 1;
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];

  assert.equal(thruLabel(snapshot, matchBox), "Thru");

  for (const player of players) updateScore(snapshot, player, round, 1, 4, 2, true, true);
  assert.equal(thruLabel(snapshot, matchBox), "Thru 1");

  for (let hole = 2; hole <= 18; hole++) {
    for (const player of players) updateScore(snapshot, player, round, hole, 4, 2, true, true);
  }
  assert.equal(thruLabel(snapshot, matchBox), "Final");
});

test("matchBoxResult closes a match when maroon wins the first 15 holes outright", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  // Maroon wins the first 15 holes outright (margin 15, completed 15,
  // holesRemaining 3) — margin > holesRemaining, so the match closes there
  // without needing holes 16-18 played.
  for (let hole = 1; hole <= 15; hole++) {
    updateScore(snapshot, "cam", round, hole, 3, 1, true, true);
    updateScore(snapshot, "drew", round, hole, 3, 1, true, true);
    updateScore(snapshot, "cade", round, hole, 5, 2, true, true);
    updateScore(snapshot, "collin", round, hole, 5, 2, true, true);
  }

  const result = matchBoxResult(snapshot, matchBox);

  assert.equal(result.leader, "maroon");
  assert.equal(result.maroonPts, 1);
  assert.equal(result.whitePts, 0);
  assert.ok(result.margin > result.holesRemaining || result.holesRemaining === 0);
});

test("matchBoxResult halves a fully-played tied match", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  for (let hole = 1; hole <= 18; hole++) {
    updateScore(snapshot, "cam", round, hole, 4, 2, true, true);
    updateScore(snapshot, "drew", round, hole, 4, 2, true, true);
    updateScore(snapshot, "cade", round, hole, 4, 2, true, true);
    updateScore(snapshot, "collin", round, hole, 4, 2, true, true);
  }

  const result = matchBoxResult(snapshot, matchBox);

  assert.equal(result.leader, "tie");
  assert.equal(result.maroonPts, 0.5);
  assert.equal(result.whitePts, 0.5);
  assert.equal(result.holesRemaining, 0);
});

test("effectiveMatchState returns Final once 18 holes are complete, even if not marked started", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  const round = 1;
  for (let hole = 1; hole <= 18; hole++) {
    for (const player of [...matchBox.maroonPlayers, ...matchBox.whitePlayers]) {
      updateScore(snapshot, player, round, hole, 4, 2, true, true);
    }
  }

  assert.equal(effectiveMatchState(snapshot, matchBox, new Date("2027-01-06T09:00:00-06:00")), "Final");
});
