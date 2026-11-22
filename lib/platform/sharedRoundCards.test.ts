import { test } from "node:test";
import assert from "node:assert/strict";
import { guestStrokes, memberCard, memberSetup, playerStrokes } from "./sharedRoundCards.ts";
import type { PersonalRoundSetup } from "./personalRound.ts";

const par = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const setup = (part: Partial<PersonalRoundSetup> = {}) => ({
  course: { ref: "c", name: "Course", place: "", par, strokeIndex: null, tees: [] }, tee: null, holes: "18", stats: true,
  countForHandicap: true, datePlayed: "2026-11-21", ...part,
}) as unknown as PersonalRoundSetup;
const holes = (who: string, from: number, to: number, extra: object = {}) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ profileId: who, hole: from + i, strokes: 5, ...extra }));

test("a joined player's card needs every hole played scored by the host", () => {
  assert.equal(memberCard({ setup: setup(), holes: holes("cade", 1, 17) }, "cade"), null, "hole 18 missing");
  const card = memberCard({ setup: setup(), holes: holes("cade", 1, 18) }, "cade")!;
  assert.equal(card.strokes.length, 18);
  assert.ok(card.strokes.every((s) => s === 5));
});

test("a 9-hole round only needs its 9; the other holes fill with par (never saved)", () => {
  const card = memberCard({ setup: setup({ holes: "back" }), holes: holes("cade", 10, 18) }, "cade")!;
  assert.deepEqual(card.strokes.slice(0, 9), par.slice(0, 9));
  assert.ok(card.strokes.slice(9).every((s) => s === 5));
});

test("stats go on the card only when the host turned player stats on", () => {
  const scored = holes("cade", 1, 18, { putts: 2, fairway: "center", green: "left" });
  const off = memberCard({ setup: setup(), holes: scored }, "cade")!;
  assert.ok(off.putts.every((p) => p === null) && off.fairways.every((f) => f === null));
  const on = memberCard({ setup: setup({ playerStats: true }), holes: scored }, "cade")!;
  assert.deepEqual([on.putts[0], on.fairways[0], on.greens[0]], [2, "center", "left"]);
  assert.equal(memberSetup(setup({ stats: true })).stats, false, "the host's own stats switch doesn't decide a player's");
  assert.equal(memberSetup(setup({ stats: false, playerStats: true })).stats, true);
});

test("live rows: a player's and a guest's strokes by hole, others ignored", () => {
  const round = { holes: [{ profileId: "cade", hole: 2, strokes: 6 }, { profileId: "jake", hole: 2, strokes: 3 }], guestHoles: [{ guestId: "g0", hole: 18, strokes: 7 }] };
  assert.equal(playerStrokes(round, "cade")[1], 6);
  assert.equal(playerStrokes(round, "cade").filter((s) => s !== null).length, 1);
  assert.equal(guestStrokes(round, "g0")[17], 7);
  assert.ok(guestStrokes({}, "g0").every((s) => s === null), "no guest rows before the SQL is run");
});
