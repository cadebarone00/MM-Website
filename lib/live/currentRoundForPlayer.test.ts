import { matchupLabel } from "./matchupLabel.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatch, LiveSessionState } from "./types.ts";
import { getPlayerDisplayName } from "../data/players/index.ts";
import { pickCurrentSession } from "./currentRoundForPlayer.ts";

function round(overrides: Partial<LiveSessionState> & { session: number }): LiveSessionState {
  return {
    seasonYear: 2027,
    started: false,
    courseId: null,
    date: "2027-01-06",
    format: "Fourball",
    courseLocked: true,
    matchupsLocked: true,
    matchTeeTimes: [null, null, null],
    ...overrides,
  };
}

function box(overrides: Partial<LiveMatch> & { session: number; maroonPlayers: string[]; whitePlayers: string[] }): LiveMatch {
  return {
    id: "box-1",
    seasonYear: 2027,
    matchNumber: 1,
    format: "Fourball",
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    state: "Scheduled",
    started: false,
    ...overrides,
  };
}

test("pickCurrentSession returns null when no session is fully locked", () => {
  const rounds = [round({ session: 1, courseLocked: false })];
  const boxes = [box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentSession(rounds, boxes, "cam"), null);
});

test("pickCurrentSession returns null when the player has no box in any locked session", () => {
  const rounds = [round({ session: 1 })];
  const boxes = [box({ session: 1, maroonPlayers: ["hugo", "nate"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentSession(rounds, boxes, "cam"), null);
});

test("pickCurrentSession returns Scheduled when the session hasn't started", () => {
  const rounds = [round({ session: 1 })];
  const boxes = [box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false })];
  const result = pickCurrentSession(rounds, boxes, "cam");
  assert.equal(result?.state, "Scheduled");
  assert.equal(result?.session.session, 1);
});

test("pickCurrentSession returns Armed when started but the tee time hasn't arrived", () => {
  const rounds = [round({ session: 1 })];
  const futureTeeTime = new Date(Date.now() + 60 * 60 * 1000);
  const boxes = [box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: futureTeeTime })];
  assert.equal(pickCurrentSession(rounds, boxes, "cam")?.state, "Armed");
});

test("pickCurrentSession returns Live once started and the tee time has passed", () => {
  const rounds = [round({ session: 1 })];
  const pastTeeTime = new Date(Date.now() - 60 * 60 * 1000);
  const boxes = [box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: pastTeeTime })];
  assert.equal(pickCurrentSession(rounds, boxes, "cam")?.state, "Live");
});

test("pickCurrentSession skips a Final session in favor of the next locked session", () => {
  const rounds = [round({ session: 1 }), round({ session: 2 })];
  const boxes = [
    box({ session: 1, matchNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], state: "Final" }),
    box({ session: 2, matchNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false }),
  ];
  const result = pickCurrentSession(rounds, boxes, "cam");
  assert.equal(result?.session.session, 2);
  assert.equal(result?.state, "Scheduled");
});

test("matchupLabel lists the player first, teammate before opponents, for Fourball", () => {
  const matchBox = box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("hugo")} vs. ${getPlayerDisplayName("drew")} & ${getPlayerDisplayName("luke")}`;
  assert.equal(matchupLabel("cam", matchBox), expected);
});

test("matchupLabel handles Singles (one player per side, no teammate)", () => {
  const matchBox = box({ session: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"] });
  assert.equal(matchupLabel("cam", matchBox), `You vs. ${getPlayerDisplayName("drew")}`);
});

test("matchupLabel works from either side of the box", () => {
  const matchBox = box({ session: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("luke")} vs. ${getPlayerDisplayName("cam")} & ${getPlayerDisplayName("hugo")}`;
  assert.equal(matchupLabel("drew", matchBox), expected);
});

import { withoutFinishedMatches } from "./currentRoundForPlayer.ts";

test("withoutFinishedMatches drops a match only when the player and their scorer have both submitted", () => {
  const singles = box({ id: "box-1", session: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"], state: "Live" });
  const match = { session: round({ session: 1 }), matchBox: singles, state: "Live" as const };
  const rows = (...players: string[]) => players.map((player_slug) => ({ match_box_id: "box-1", player_slug }));
  assert.equal(withoutFinishedMatches([match], "cam", []).length, 1);
  assert.equal(withoutFinishedMatches([match], "cam", rows("cam")).length, 1);
  assert.equal(withoutFinishedMatches([match], "cam", rows("cam", "drew")).length, 0);
  assert.equal(withoutFinishedMatches([match], "cam", [{ match_box_id: "other-box", player_slug: "drew" }, ...rows("cam")]).length, 1);
});
