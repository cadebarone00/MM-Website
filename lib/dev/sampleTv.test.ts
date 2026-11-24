import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleTvBoard } from "./sampleTv";

test("2 Teams: one player a side, the Tigers vs Rebels header stays", () => {
  const board = sampleTvBoard(24, "live", "trip");
  assert.equal(board.match!.matches.length, 12);
  assert.equal(board.match!.teamHeader, undefined);
  assert.equal(board.match!.matches[0].leftPlayers, undefined);
});

test("Pairs / 3-Ball / 4-Ball: whole teams a side, each with its own color, no team header", () => {
  for (const [teams, size, count] of [["pairs", 2, 6], ["3ball", 3, 4], ["4ball", 4, 3]] as const) {
    const board = sampleTvBoard(24, "live", "trip", teams);
    assert.equal(board.match!.teamHeader, false, teams);
    assert.equal(board.match!.matches.length, count, teams);
    const first = board.match!.matches[0];
    assert.equal(first.left, "Team Collins", teams);
    assert.equal(first.leftPlayers!.split(" · ").length, size, teams);
    assert.notEqual(first.leftColor, first.rightColor, teams);
  }
});

test("group size: before a round, a line starts each group and groups share a tee time; none once scores are in", () => {
  const before = sampleTvBoard(12, "before", "trip", "two", "3").individual!;
  assert.deepEqual(before.flatMap((row, i) => row.groupStart ? [i] : []), [3, 6, 9]);
  assert.deepEqual(before.slice(0, 4).map((row) => row.thru), ["8:00", "8:00", "8:00", "8:10"]);
  assert.ok(sampleTvBoard(12, "live", "trip", "two", "3").individual!.every((row) => !row.groupStart));
});
