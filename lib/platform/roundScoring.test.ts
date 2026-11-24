import { test } from "node:test";
import assert from "node:assert/strict";
import { finishHoleSends, nextHoleLabel, nextPar, stepStrokes, submitCard, toggleChoice, withDaytonaLeft, withDaytonaMiddle, withDouble, withSidePick, withWolfPick, wolfView } from "./roundScoring.ts";

const PAR = [4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4];

test("Next hole: my box (par when untouched) is sent only when the round differs; empty players get par", () => {
  assert.deepEqual(finishHoleSends({ hole: 2, par: PAR, myBox: undefined, myInRound: null, others: [{ key: "c", inRound: null }, { key: "g1", inRound: 4 }] }),
    { mine: 3, others: [{ key: "c", strokes: 3 }] });
  assert.deepEqual(finishHoleSends({ hole: 0, par: PAR, myBox: 5, myInRound: 5, others: [] }), { mine: null, others: [] });
});

test("score boxes step from par and stay between 1 and 15", () => {
  assert.equal(stepStrokes(null, 4, 1), 5);
  assert.equal(stepStrokes(null, 4, -1), 3);
  assert.equal(stepStrokes(1, 3, -1), 1);
  assert.equal(stepStrokes(15, 4, 1), 15);
});

test("Wolf: rotates in order, words for you and others, partners exclude the Wolf", () => {
  const names = ["You", "Cam", "Rob", "Max"];
  const first = wolfView(0, [0, 18], names, undefined);
  assert.equal(first.title, "You are the Wolf");
  assert.equal(first.hint, "Pick a partner, or go it alone");
  assert.deepEqual(first.partners, [1, 2, 3]);
  assert.equal(wolfView(1, [0, 18], names, null).hint, "Cam goes Lone Wolf · points ×2");
  assert.equal(wolfView(1, [0, 18], names, 2).hint, "Cam + Rob vs the rest");
  assert.equal(wolfView(9, [9, 18], names, undefined).title, "You are the Wolf");
});

test("taps toggle: pick, tap again to clear; double on and off; side games drop the key when cleared", () => {
  assert.equal(toggleChoice(undefined, 2), 2);
  assert.equal(toggleChoice(2, 2), undefined);
  assert.deepEqual(withWolfPick({}, 1), { wolfPartner: 1 });
  assert.deepEqual(withWolfPick({ wolfPartner: 1 }, 1), { wolfPartner: undefined });
  assert.deepEqual(withWolfPick({ wolfPartner: 1 }, null), { wolfPartner: null });
  assert.deepEqual(withDouble({}), { doubled: true });
  assert.deepEqual(withDouble({ doubled: true }), { doubled: false });
  assert.deepEqual(withSidePick({}, "greenie", null), { greenie: null });
  assert.deepEqual(withSidePick({ greenie: null }, "greenie", null), {});
  assert.deepEqual(withSidePick({ closestPin: 0 }, "closestPin", 1), { closestPin: 1 });
});

test("Daytona: middle splits the rest; tapping someone moves them into the left pair", () => {
  const set = withDaytonaMiddle({}, 5, 2);
  assert.deepEqual(set.daytona, { middle: 2, left: [0, 1], right: [3, 4] });
  assert.deepEqual(withDaytonaMiddle(set, 5, 2).daytona, undefined);
  assert.deepEqual(withDaytonaLeft(set, 5, 4).daytona, { middle: 2, left: [1, 4], right: [0, 3] });
});

test("Submit card: untouched holes in play count as par, holes not played are par, stats only when tracked", () => {
  const strokes = Array.from({ length: 18 }, () => null as number | null);
  strokes[0] = 6;
  const card = submitCard({ par: PAR, holes: "front", strokes, putts: [2], fairways: ["left"], greens: [], stats: false });
  assert.equal(card.strokes[0], 6);
  assert.equal(card.strokes[1], 4);
  assert.equal(card.strokes[17], 4);
  assert.equal(card.putts[0], null);
  const withStats = submitCard({ par: PAR, holes: "18", strokes, putts: [2], fairways: ["left"], greens: [], stats: true });
  assert.equal(withStats.putts[0], 2);
  assert.equal(withStats.fairways[0], "left");
  assert.equal(withStats.greens[0], null);
});

test("labels and par cycling", () => {
  assert.equal(nextHoleLabel(16, [0, 18]), "Next hole");
  assert.equal(nextHoleLabel(17, [0, 18]), "Scorecard");
  assert.equal(nextHoleLabel(8, [0, 9]), "Scorecard");
  assert.equal(nextPar(4), 5);
  assert.equal(nextPar(6), 3);
});

test("Submit & Save needs every hole's stats when Track stats is on (no fairway on par 3s)", async () => {
  const { cardDone, holeStatsDone } = await import("./roundScoring.ts");
  const none = Array.from({ length: 18 }, () => null);
  assert.equal(cardDone({ range: [0, 18], par: PAR, putts: none, fairways: none, greens: none, stats: false }), true);
  assert.equal(cardDone({ range: [0, 18], par: PAR, putts: none, fairways: none, greens: none, stats: true }), false);
  assert.equal(holeStatsDone({ hole: 2, par: PAR, putts: [0, 0, 2], fairways: [], greens: [null, null, "center"], stats: true }), true);
  assert.equal(holeStatsDone({ hole: 0, par: PAR, putts: [2], fairways: [], greens: ["center"], stats: true }), false);
  const all = <T,>(v: T) => Array.from({ length: 18 }, () => v);
  assert.equal(cardDone({ range: [0, 9], par: PAR, putts: all(2), fairways: all("center" as const), greens: all("center" as const), stats: true }), true);
});

test("putts choices, to-par text and thru match the website sheet; penalties ride along with stats", async () => {
  const { PUTT_CHOICES, puttLabel, toParText, thruAndToPar, submitCard } = await import("./roundScoring.ts");
  assert.deepEqual([...PUTT_CHOICES].map(puttLabel), ["0", "1", "2", "3", "4+"]);
  assert.equal(toParText(0), "E");
  assert.equal(toParText(2), "+2");
  assert.equal(toParText(-1), "-1");
  const strokes = Array.from({ length: 18 }, () => null as number | null);
  assert.deepEqual(thruAndToPar(strokes, PAR, [0, 18]), { thru: 0, toPar: null });
  strokes[0] = 5; strokes[2] = 2;
  assert.deepEqual(thruAndToPar(strokes, PAR, [0, 18]), { thru: 2, toPar: 0 });
  const pens = Array.from({ length: 18 }, () => null as { fairway: boolean; green: boolean } | null);
  pens[0] = { fairway: true, green: false };
  const card = submitCard({ par: PAR, holes: "18", strokes, putts: [], fairways: [], greens: [], penalties: pens, stats: true });
  assert.deepEqual(card.penalties?.[0], { fairway: true, green: false });
  assert.deepEqual(card.penalties?.[1], { fairway: false, green: false });
  assert.equal(submitCard({ par: PAR, holes: "18", strokes, putts: [], fairways: [], greens: [], penalties: pens, stats: false }).penalties, undefined);
});
