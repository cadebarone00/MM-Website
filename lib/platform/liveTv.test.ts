import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsText, toParText, tvBoards, type TvBoardData } from "./liveTv.ts";

const data = (individual: boolean, match: boolean): TvBoardData => ({
  eventName: "Fall Classic", roundLabel: "Round 1",
  individual: individual ? [{ position: "1", name: "Cam", total: -2, today: -2, thru: "F" }] : null,
  match: match ? { teams: [{ name: "A", color: "#000", points: 1 }, { name: "B", color: "#fff", points: 0 }], toWin: null, matches: [] } : null,
});

test("to par: E, -3, +2, or a dash with no score", () => {
  assert.deepEqual([toParText(0), toParText(-3), toParText(2), toParText(null)], ["E", "-3", "+2", "–"]);
});

test("the boards that take turns are the organizer's pick, limited to what the event has", () => {
  assert.deepEqual(tvBoards(data(true, true), "both"), ["individual", "match"]);
  assert.deepEqual(tvBoards(data(true, true), "match"), ["match"]);
  assert.deepEqual(tvBoards(data(true, false), "both"), ["individual"]);
  assert.deepEqual(tvBoards(data(true, false), "match"), ["individual"], "falls back to the board it has");
  assert.deepEqual(tvBoards(data(false, false), "both"), []);
});

test("points read like a golf board", () => {
  assert.deepEqual([pointsText(6.5), pointsText(0.5), pointsText(4), pointsText(12.5)], ["6½", "½", "4", "12½"]);
});
