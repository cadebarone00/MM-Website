import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatchBox, LiveRoundState } from "./types.ts";
import { getPlayerDisplayName } from "../data/players/index.ts";
import { pickCurrentRound, matchupLabel } from "./currentRoundForPlayer.ts";

function round(overrides: Partial<LiveRoundState> & { round: number }): LiveRoundState {
  return {
    started: false,
    courseId: null,
    date: "2027-01-06",
    format: "Fourball",
    courseLocked: true,
    matchupsLocked: true,
    ...overrides,
  };
}

function box(overrides: Partial<LiveMatchBox> & { round: number; maroonPlayers: string[]; whitePlayers: string[] }): LiveMatchBox {
  return {
    id: "box-1",
    boxNumber: 1,
    format: "Fourball",
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    state: "Scheduled",
    started: false,
    ...overrides,
  };
}

test("pickCurrentRound returns null when no round is fully locked", () => {
  const rounds = [round({ round: 1, courseLocked: false })];
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam"), null);
});

test("pickCurrentRound returns null when the player has no box in any locked round", () => {
  const rounds = [round({ round: 1 })];
  const boxes = [box({ round: 1, maroonPlayers: ["hugo", "nate"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam"), null);
});

test("pickCurrentRound returns Scheduled when the round hasn't started", () => {
  const rounds = [round({ round: 1 })];
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false })];
  const result = pickCurrentRound(rounds, boxes, "cam");
  assert.equal(result?.state, "Scheduled");
  assert.equal(result?.round.round, 1);
});

test("pickCurrentRound returns Armed when started but the tee time hasn't arrived", () => {
  const rounds = [round({ round: 1 })];
  const futureTeeTime = new Date(Date.now() + 60 * 60 * 1000);
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: futureTeeTime })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam")?.state, "Armed");
});

test("pickCurrentRound returns Live once started and the tee time has passed", () => {
  const rounds = [round({ round: 1 })];
  const pastTeeTime = new Date(Date.now() - 60 * 60 * 1000);
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: pastTeeTime })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam")?.state, "Live");
});

test("pickCurrentRound skips a Final round in favor of the next locked round", () => {
  const rounds = [round({ round: 1 }), round({ round: 2 })];
  const boxes = [
    box({ round: 1, boxNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], state: "Final" }),
    box({ round: 2, boxNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false }),
  ];
  const result = pickCurrentRound(rounds, boxes, "cam");
  assert.equal(result?.round.round, 2);
  assert.equal(result?.state, "Scheduled");
});

test("matchupLabel lists the player first, teammate before opponents, for Fourball", () => {
  const matchBox = box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("hugo")} vs. ${getPlayerDisplayName("drew")} & ${getPlayerDisplayName("luke")}`;
  assert.equal(matchupLabel("cam", matchBox), expected);
});

test("matchupLabel handles Singles (one player per side, no teammate)", () => {
  const matchBox = box({ round: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"] });
  assert.equal(matchupLabel("cam", matchBox), `You vs. ${getPlayerDisplayName("drew")}`);
});

test("matchupLabel works from either side of the box", () => {
  const matchBox = box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("luke")} vs. ${getPlayerDisplayName("cam")} & ${getPlayerDisplayName("hugo")}`;
  assert.equal(matchupLabel("drew", matchBox), expected);
});
