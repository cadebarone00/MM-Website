import assert from "node:assert/strict";
import test from "node:test";
import { courseHandicap, gamesFor, scoreGame, sixesTeams, strokesReceived, wolfFor, type GameConfig, type GameCourse, type HoleInput } from "./roundGames";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course: GameCourse = { par: PAR, rating: null, slope: null };
const ALL: [number, number] = [0, 18];
const names = (n: number) => ["Cam", "Cade", "Jake", "Mike", "Alex"].slice(0, n).map((name) => ({ name, handicap: null }));
/** Everyone pars every hole, then `edits` change single holes: [player, hole, strokes]. */
const card = (n: number, edits: [number, number, number][] = [], played = 18) => {
  const rows = Array.from({ length: n }, () => PAR.map((p, h) => h < played ? p : null) as (number | null)[]);
  for (const [p, h, s] of edits) rows[p][h] = s;
  return rows;
};
const game = (id: GameConfig["id"], extra: Partial<GameConfig> = {}): GameConfig => ({ id, net: false, birdiesDouble: false, ...extra });
const value = (result: ReturnType<typeof scoreGame>, label: string) => result.standings.find((s) => s.label === label)?.value;

test("games only show for group sizes they fit", () => {
  const ids = (n: number) => gamesFor(n).map((g) => g.id);
  assert.ok(ids(5).includes("daytona") && ids(5).includes("wolf") && !ids(5).includes("vegas"));
  assert.ok(ids(4).includes("wolf") && ids(4).includes("vegas") && ids(4).includes("sixes") && !ids(4).includes("daytona"));
  assert.ok(ids(3).includes("nines") && !ids(3).includes("wolf"));
});

test("daytona: middle with the outright low wins 1 from each of the other 4; left/right doesn't also score", () => {
  const spot: HoleInput = { daytona: { left: [0, 1], middle: 2, right: [3, 4] } };
  const r = scoreGame(game("daytona"), names(5), course, ALL, card(5, [[2, 0, 3]], 1), [spot]);
  assert.equal(value(r, "Jake"), "+4");
  assert.equal(value(r, "Cam"), "-1");
});

test("daytona: middle can't lose; left best ball beats right = +2 each / -2 each; birdies double", () => {
  const spot: HoleInput = { daytona: { left: [0, 1], middle: 2, right: [3, 4] } };
  const plain = scoreGame(game("daytona"), names(5), course, ALL, card(5, [[0, 0, 3], [2, 0, 6]], 1), [spot]);
  // Cam birdies hole 1 (left pair wins), Jake (middle) makes a 6 and loses nothing.
  assert.deepEqual([value(plain, "Cam"), value(plain, "Cade"), value(plain, "Jake"), value(plain, "Mike")], ["+2", "+2", "0", "-2"]);
  const doubled = scoreGame(game("daytona", { birdiesDouble: true }), names(5), course, ALL, card(5, [[0, 0, 3], [2, 0, 6]], 1), [spot]);
  assert.equal(value(doubled, "Cam"), "+4");
  const tied = scoreGame(game("daytona"), names(5), course, ALL, card(5, [], 1), [spot]);
  assert.ok(tied.standings.every((s) => s.value === "0"), "tied best balls = no points");
});

test("wolf: rotates, partner side wins 1 each, lone wolf doubles, unpicked holes don't score", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((h) => wolfFor(h, ALL, 5)), [0, 1, 2, 3, 4, 0]);
  const inputs: HoleInput[] = [{ wolfPartner: 1 }, { wolfPartner: null }];
  const r = scoreGame(game("wolf"), names(4), course, ALL, card(4, [[0, 0, 3], [1, 1, 4]], 3), inputs);
  // Hole 1: Cam (wolf) + Cade win: +2 each, Jake & Mike -2. Hole 2: Cade lone wolf birdies: +2 from each of 3 = +6.
  assert.equal(value(r, "Cade"), "+8");
  assert.equal(value(r, "Cam"), "0");
  assert.equal(value(r, "Jake"), "-4");
});

test("skins carry over on ties and birdies double the skin", () => {
  const r = scoreGame(game("skins", { birdiesDouble: true }), names(3), course, ALL, card(3, [[1, 1, 4]], 2));
  assert.equal(value(r, "Cade"), "4 skins");
  const carry = scoreGame(game("skins"), names(3), course, ALL, card(3, [], 3));
  assert.equal(carry.note, "3 skins carrying over");
});

test("vegas: team numbers, low number wins the difference", () => {
  // Hole 1: Cam 4 + Cade 5 = 45 v Jake 5 + Mike 5 = 55 → +10 each to Cam & Cade.
  const r = scoreGame(game("vegas", { teams: [0, 0, 1, 1] }), names(4), course, ALL, card(4, [[1, 0, 5], [2, 0, 5], [3, 0, 5]], 1));
  assert.equal(value(r, "Cam"), "+20");
  assert.equal(value(r, "Jake"), "-20");
});

test("nines: 5-3-1, ties split", () => {
  const r = scoreGame(game("nines"), names(3), course, ALL, card(3, [[0, 0, 3], [2, 0, 5], [0, 1, 4], [1, 1, 4]], 2));
  // Hole 1: 5/3/1. Hole 2: Cam & Cade tie low (4,4,1).
  assert.deepEqual([value(r, "Cam"), value(r, "Cade"), value(r, "Jake")], ["9 pts", "7 pts", "2 pts"]);
});

test("sixes rotates partners every 6 holes", () => {
  assert.deepEqual(sixesTeams(0, ALL), [[0, 1], [2, 3]]);
  assert.deepEqual(sixesTeams(6, ALL), [[0, 2], [1, 3]]);
  assert.deepEqual(sixesTeams(17, ALL), [[0, 3], [1, 2]]);
});

test("match play status and nassau segments", () => {
  const r = scoreGame(game("match"), names(2), course, ALL, card(2, [[0, 0, 3], [0, 1, 4]], 3));
  assert.equal(r.note, "Cam 2 UP");
  const nassau = scoreGame(game("nassau"), names(2), course, ALL, card(2, [[1, 10, 3]]));
  assert.deepEqual(nassau.standings.map((s) => s.value), ["All square", "Cade 1 UP (won)", "Cade 1 UP (won)"]);
});

test("stableford, bingo bango bongo, snake and team formats", () => {
  const st = scoreGame(game("stableford", { birdiesDouble: true }), names(2), course, ALL, card(2, [[0, 0, 3]], 1));
  assert.equal(value(st, "Cam"), "6 pts");
  const bbb = scoreGame(game("bbb"), names(3), course, ALL, card(3, [], 1), [{ bbb: { bingo: 0, bango: 0, bongo: 2 } }]);
  assert.equal(value(bbb, "Cam"), "2 pts");
  const snake = scoreGame(game("snake"), names(3), course, [0, 9], card(3), [{ snake: 1 }, {}, { snake: 2 }]);
  assert.equal(snake.note, "Jake has the snake");
  assert.equal(value(snake, "Jake"), "-2");
  const scramble = scoreGame(game("scramble", { teams: [0, 0, 1, 1] }), names(4), course, ALL, card(4, [[1, 0, 3]], 1));
  assert.equal(scramble.standings[0].label, "Cam & Cade");
  assert.equal(scramble.standings[0].value, "3");
});

test("net: course handicap strokes go to the hardest holes first", () => {
  const rated: GameCourse = { par: PAR, rating: 72, slope: 113, strokeIndex: PAR.map((_, i) => i + 1) };
  assert.equal(courseHandicap(10.4, rated, ALL), 10);
  assert.equal(courseHandicap(10.4, rated, [0, 9]), 5);
  const got = strokesReceived(20, rated, ALL);
  assert.equal(got[0], 2);
  assert.equal(got[17], 1);
  assert.equal(got.reduce((a, b) => a + b, 0), 20);
  const net = scoreGame({ id: "stroke", net: true, birdiesDouble: false }, [{ name: "Cam", handicap: 18 }, { name: "Cade", handicap: 0 }], rated, ALL, card(2, [], 1));
  assert.equal(net.standings[0].label, "Cam");
});
