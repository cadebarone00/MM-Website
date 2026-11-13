import { test } from "node:test";
import assert from "node:assert/strict";
import { changeFrom, courseFrom, dateFrom, handicapFrom } from "./leaguesRequest.ts";

const ID = "2f0c1a3e-9b7d-4c21-8e55-0a1b2c3d4e5f", ID2 = "3f0c1a3e-9b7d-4c21-8e55-0a1b2c3d4e5f";
const par = Array(18).fill(4);

test("course: an 18-hole scorecard only; stroke index kept when it's complete; tee optional", () => {
  const course = courseFrom({ ref: "c1", name: "Test GC", place: "Dallas", par, strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1), tee: { name: "Blue", rating: 70.2, slope: 121 } });
  assert.equal(course?.par.length, 18); assert.equal(course?.strokeIndex?.length, 18); assert.equal(course?.tee?.slope, 121);
  assert.equal(courseFrom({ name: "Nine", par: Array(9).fill(4) }), null);
  assert.equal(courseFrom({ name: "Bad", par: [...Array(17).fill(4), 9] }), null);
  assert.equal(courseFrom({ name: "No SI", par, strokeIndex: [1, 2] })?.strokeIndex, null);
  assert.equal(courseFrom(null), null);
  assert.equal(handicapFrom(12.34), 12.3); assert.equal(handicapFrom(99), null); assert.equal(handicapFrom("5"), null);
  assert.equal(dateFrom("2026-11-20"), "2026-11-20"); assert.equal(dateFrom("Nov 20"), null);
});

test("changes: each action's shape is checked; anything else is refused", () => {
  assert.deepEqual(changeFrom({ action: "strokes", player: ID, hole: 18, strokes: 5 }), { action: "strokes", player: ID, hole: 18, strokes: 5 });
  assert.deepEqual(changeFrom({ action: "strokes", player: ID, hole: 3, strokes: null }), { action: "strokes", player: ID, hole: 3, strokes: null });
  for (const bad of [{ action: "strokes", player: ID, hole: 19, strokes: 4 }, { action: "strokes", player: "me", hole: 1, strokes: 4 }, { action: "strokes", player: ID, hole: 1, strokes: 0 },
    { action: "nope" }, null, { action: "submit", group: 0 }]) assert.equal(changeFrom(bad), null, JSON.stringify(bad));
  assert.deepEqual(changeFrom({ action: "groups", groups: [{ time: "08:00", hole: 1, scorer: ID, players: [ID, ID2] }] })?.action, "groups");
  assert.equal(changeFrom({ action: "groups", groups: [{ time: "8am", hole: 1, scorer: ID, players: [ID] }] }), null);
  assert.equal(changeFrom({ action: "groups", groups: [{ time: "", hole: 1, scorer: ID, players: [ID, ID, ID, ID, ID, ID] }] }), null);
  const pairs = { on: true, format: "bestball", net: false, segments: 9, rule: "random", locked: true, teams: [[ID, ID2]] };
  const skins = { on: true, net: true, carryover: false };
  assert.equal(changeFrom({ action: "settings", scoring: "Net", skins, pairs })?.action, "settings");
  assert.equal(changeFrom({ action: "settings", scoring: "Net", skins, pairs: { ...pairs, segments: 7 } }), null);
  assert.equal(changeFrom({ action: "settings", scoring: "Net", skins, pairs: { ...pairs, format: "scramble" } }), null);
  assert.equal(changeFrom({ action: "settings", scoring: "Both", skins, pairs }), null);
  assert.deepEqual(changeFrom({ action: "game", group: 2, game: { id: "wolf", net: true, birdiesDouble: false }, inputs: [{ wolfPartner: 1 }] }),
    { action: "game", group: 2, game: { id: "wolf", net: true, birdiesDouble: false }, inputs: [{ wolfPartner: 1 }] });
  assert.deepEqual(changeFrom({ action: "game", group: 2, game: null }), { action: "game", group: 2, game: null, inputs: [] });
  assert.equal(changeFrom({ action: "game", group: 2, game: { id: "poker", net: true, birdiesDouble: false } }), null);
  assert.deepEqual(changeFrom({ action: "end" }), { action: "end" });
});
