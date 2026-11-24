import { test } from "node:test";
import assert from "node:assert/strict";
import type { PersonalRoundSetup } from "./personalRound.ts";
import { cardNines, cashCell, leaderboardLines, nineTotal, orderPeople, roundGameView, scoreMark, type BoardPerson } from "./roundBoard.ts";

const PAR = [4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4];
const row = (scores: (number | null)[]) => [...scores, ...Array.from({ length: 18 - scores.length }, () => null)];
const person = (key: string, name: string, scores: (number | null)[]): BoardPerson => ({ key, name, handicap: null, strokes: row(scores) });

test("playing order: the host's chosen order first, everyone else after in their own order", () => {
  const people = [person("a", "A", []), person("b", "B", []), person("g1", "G", [])];
  assert.deepEqual(orderPeople(people, ["g1", "a"]).map((p) => p.key), ["g1", "a", "b"]);
  assert.deepEqual(orderPeople(people, undefined).map((p) => p.key), ["a", "b", "g1"]);
});

test("leaderboard: sorted by to par, ties share a place, E / +n / −n, and nothing played shows –", () => {
  const board = leaderboardLines({
    rows: [{ name: "You", strokes: row([5, 4]) }, { name: "Cam", strokes: row([4, 4]) }, { name: "Rob", strokes: row([4, 4]) }, { name: "Max", strokes: row([]) }],
    par: PAR, range: [0, 18], result: null,
  });
  assert.deepEqual(board.lines.map((l) => [l.name, l.position, l.total, l.tone]), [
    ["Cam", "T1", "E", "even"], ["Rob", "T1", "E", "even"], ["You", "3", "+1", "over"], ["Max", "4", "–", undefined],
  ]);
  assert.equal(board.hasMoney, false);
  assert.equal(board.skins, false);
});

test("leaderboard head: the first hole not everyone has finished, and how far everyone is through", () => {
  const board = leaderboardLines({ rows: [{ name: "You", strokes: row([4, 4, 3]) }, { name: "Cam", strokes: row([4, 4]) }], par: PAR, range: [0, 18], result: null });
  assert.equal(board.now, 2);
  assert.equal(board.head, "Hole 3 · thru 2");
  assert.equal(leaderboardLines({ rows: [{ name: "You", strokes: row([4]) }], par: PAR, range: [0, 18], result: null, hole: 6 }).head, "Hole 7 · thru 1");
});

test("Skins with $5 a skin: SKINS and $ columns, side-game money adds in", () => {
  const setup = {
    course: { ref: "c", name: "C", place: "", par: PAR, tees: [] }, tee: null, holes: "18", stats: false, countForHandicap: false,
    datePlayed: "2026-11-24", players: [], myHandicap: null, game: { id: "skins", net: false, birdiesDouble: false, stake: 5 },
  } as unknown as PersonalRoundSetup;
  // Hole 1: You 3 (birdie) beats Cam 4 → You win the skin.
  const ordered = [person("a", "You", [3]), person("b", "Cam", [4])];
  const view = roundGameView(setup, ordered, Array.from({ length: 18 }, () => ({})));
  assert.equal(view.gameFits, true);
  assert.ok(view.result);
  const board = leaderboardLines({ rows: view.rows, par: view.par, range: view.range, result: view.result, holeMoney: view.holeMoney, extraMoney: view.extraMoney });
  assert.equal(board.skins, true);
  assert.equal(board.hasMoney, true);
  const you = board.lines.find((l) => l.name === "You")!;
  const cam = board.lines.find((l) => l.name === "Cam")!;
  assert.equal(board.lines[0].name, "You");
  assert.equal(you.gameValue, "1");
  assert.ok(you.cash > 0);
  assert.equal(you.cash, -cam.cash);
  assert.equal(you.pnl?.[0], you.cash);
});

test("a game with the wrong number of players isn't scored", () => {
  const setup = {
    course: { ref: "c", name: "C", place: "", par: PAR, tees: [] }, tee: null, holes: "18", stats: false, countForHandicap: false,
    datePlayed: "2026-11-24", players: [], myHandicap: null, game: { id: "wolf", net: false, birdiesDouble: false },
  } as unknown as PersonalRoundSetup;
  const view = roundGameView(setup, [person("a", "You", [4]), person("b", "Cam", [4])], Array.from({ length: 18 }, () => ({})));
  assert.equal(view.gameFits, false);
  assert.equal(view.result, null);
});

test("scorecard helpers", () => {
  assert.equal(scoreMark(-2), "eagle");
  assert.equal(scoreMark(-1), "birdie");
  assert.equal(scoreMark(0), "par");
  assert.equal(scoreMark(1), "bogey");
  assert.equal(scoreMark(3), "double");
  assert.equal(cardNines([0, 18]).length, 2);
  assert.deepEqual(cardNines([9, 18]), [[9, 10, 11, 12, 13, 14, 15, 16, 17]]);
  assert.equal(nineTotal([0, 1, 2], [4, null, 3]), 7);
  assert.equal(nineTotal([0, 1], [null, null]), null);
  assert.equal(cashCell(5), "+5");
  assert.equal(cashCell(-3), "−3");
  assert.equal(cashCell(0), "–");
  assert.equal(cashCell(null), "");
});

test("round people: invited/joined players by position (you = You, first names), host handicap from setup, then guests", async () => {
  const { roundPeople, picksByHole } = await import("./roundBoard.ts");
  const round = {
    host: "h", setup: { myHandicap: 8, players: [{ profileId: "c", name: "Cam Smith", handicap: 12 }], guests: [{ id: "g1", name: "Uncle Rob", handicap: null }] } as unknown as PersonalRoundSetup,
    players: [
      { profileId: "c", name: "Cam Smith", position: 2, status: "joined" as const },
      { profileId: "h", name: "Cade Barone", position: 1, status: "joined" as const },
      { profileId: "x", name: "Gone Guy", position: 3, status: "declined" as const },
    ],
    holes: [{ profileId: "c", hole: 1, strokes: 5 }], guestHoles: [{ guestId: "g1", hole: 2, strokes: 6 }],
  };
  const people = roundPeople(round, "h");
  assert.deepEqual(people.map((p) => [p.key, p.name, p.handicap]), [["h", "You", 8], ["c", "Cam", 12], ["g1", "Uncle", null]]);
  assert.equal(people[1].strokes[0], 5);
  assert.equal(people[2].strokes[1], 6);
  assert.deepEqual(picksByHole([{ hole: 3, pick: { doubled: true } }])[2], { doubled: true });
  assert.deepEqual(picksByHole([])[0], {});
});
