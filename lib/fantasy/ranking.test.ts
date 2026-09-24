import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRankLabel, isTiedAmong, rankAmong, rankEntries } from "./ranking.ts";

test("rankAmong is 1st when no one scores higher", () => {
  assert.equal(rankAmong([10, 8, 3], 10), 1);
});

test("rankAmong counts everyone strictly above", () => {
  assert.equal(rankAmong([15, 12, 8, 3], 8), 3);
});

test("rankAmong: ties share a rank", () => {
  assert.equal(rankAmong([10, 10, 8], 10), 1);
  assert.equal(rankAmong([10, 10, 8], 8), 3);
});

test("rankAmong works with just yourself in the list", () => {
  assert.equal(rankAmong([5], 5), 1);
});

test("rankAmong last place", () => {
  assert.equal(rankAmong([20, 15, 10, 5], 5), 4);
});

test("isTiedAmong is false when your score is unique", () => {
  assert.equal(isTiedAmong([10, 8, 3], 10), false);
});

test("isTiedAmong is true when another score matches exactly", () => {
  assert.equal(isTiedAmong([10, 10, 8], 10), true);
});

test("isTiedAmong is false when alone in the list", () => {
  assert.equal(isTiedAmong([7], 7), false);
});

test("formatRankLabel prefixes T only when tied", () => {
  assert.equal(formatRankLabel(3, true), "T3");
  assert.equal(formatRankLabel(3, false), "3");
  assert.equal(formatRankLabel(1, false), "1");
});

test("rankEntries sorts highest first and labels ties", () => {
  const entries = [
    { name: "Cade", total: 10 },
    { name: "Cam", total: 15 },
    { name: "Drew", total: 10 },
    { name: "Pete", total: 3 },
  ];
  const ranked = rankEntries(entries, (e) => e.total);
  assert.deepEqual(
    ranked.map((r) => ({ name: r.entry.name, rank: r.rank, rankLabel: r.rankLabel })),
    [
      { name: "Cam", rank: 1, rankLabel: "1" },
      { name: "Cade", rank: 2, rankLabel: "T2" },
      { name: "Drew", rank: 2, rankLabel: "T2" },
      { name: "Pete", rank: 4, rankLabel: "4" },
    ]
  );
});

test("rankEntries handles a single entry", () => {
  const ranked = rankEntries([{ total: 5 }], (e) => e.total);
  assert.deepEqual(ranked.map((r) => r.rankLabel), ["1"]);
});

test("rankEntries handles an empty list", () => {
  assert.deepEqual(rankEntries([] as { total: number }[], (e) => e.total), []);
});
