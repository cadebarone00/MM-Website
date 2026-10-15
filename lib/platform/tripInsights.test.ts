import assert from "node:assert/strict";
import test from "node:test";
import { courseInsights, playerStats, type TripRound } from "./tripInsights";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
function round(profileId: string, course: string, over: number[], extra: Partial<TripRound["holes"][number]> = {}): TripRound {
  const holes = PAR.map((par, i) => ({ number: i + 1, par, strokes: par + (over[i] ?? 0), putts: 2, fairway: par === 3 ? null : "center" as const, green: "center" as const, ...extra }));
  return { profileId, course: { ref: null, name: course, place: "" }, holes, total: holes.reduce((a, h) => a + h.strokes, 0), holesPlayed: 18 };
}
const name = (id: string) => id.toUpperCase();

test("course view: courses ranked hardest first; hardest / easiest / most birdied hole; 3-hole stretches", () => {
  const hard = Array(18).fill(1); hard[16] = 3;
  const rounds = [round("a", "Easy CC", [-1, 0, 0]), round("b", "Easy CC", [-1, 0, 0]), round("a", "Hard GC", hard), round("b", "Hard GC", hard)];
  const c = courseInsights(rounds, name);
  assert.deepEqual(c.courses.map((x) => x.course), ["Hard GC", "Easy CC"]);
  assert.deepEqual([c.hardestHole?.course, c.hardestHole?.hole], ["Hard GC", 17]);
  assert.deepEqual([c.mostBirdied?.course, c.mostBirdied?.hole, c.mostBirdied?.birdies], ["Easy CC", 1, 2]);
  assert.deepEqual([c.hardestStretch?.from, c.hardestStretch?.to], [15, 17]);
  assert.equal(c.easiestStretch?.course, "Easy CC");
  assert.equal(c.bestRound?.toPar, -1);
});

test("individual view: bounce back, fall off, par types and putts rank best first", () => {
  // A: bogey then birdie three times (bounce back 100%); B: birdie then bogey three times (fall off 100%).
  const a = round("a", "X", [1, -1, 1, -1, 1, -1]), b = round("b", "X", [-1, 1, -1, 1, -1, 1], { putts: 3 });
  const stats = playerStats([a, b], name);
  const get = (id: string) => stats.find((s) => s.id === id)!;
  assert.deepEqual(get("bounceBack").ranking[0], { name: "A", value: 100 });
  assert.deepEqual(get("fallOff").ranking.at(-1), { name: "B", value: 100 });
  assert.equal(get("putts").ranking[0].name, "A");
  assert.ok(get("par4").ranking.length === 2);
});

test("not enough chances: a stat with too few holes is left out rather than showing 100% from one hole", () => {
  const stats = playerStats([round("a", "X", [1, -1])], name);
  assert.equal(stats.find((s) => s.id === "bounceBack"), undefined);
});
