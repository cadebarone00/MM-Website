import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { liveCardFromSheet } from "./liveCards.ts";
import { organizerOwnEdits, overrideHole, pushThrough } from "./scoreEdits.ts";

const par = Array.from({ length: 18 }, (_, i) => (i === 2 ? 3 : 4));
const tripRound = (extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id: "r1", profileId: "jake", source: "trip", tripId: "t", tripRoundId: "round-1", datePlayed: "2027-04-12",
  course: { ref: null, name: "Pine", place: "" }, tee: { name: "Blue", rating: 71.4, slope: 131 }, holesPlayed: 18, format: "Stroke play", enteredBy: "player",
  holes: par.map((p, i) => ({ number: i + 1, par: p, strokes: p, putts: 2, fairway: p === 3 ? null : "center", green: "center" })), ...extra,
});
const edit = { byProfileId: "cade", at: "2027-04-12T20:00:00Z", reason: "OB on 7" };

test("an override changes the hole, logs old → new with the reason, re-totals and still counts", () => {
  const before = tripRound({ removedFromProfile: true, groupId: "g1" });
  const after = overrideHole(before, { hole: 7, field: "strokes", to: 6, ...edit });
  assert.equal(after.holes[6].strokes, 6);
  assert.equal(after.total, before.total + 2);
  assert.equal(after.countsForHandicap, true);
  assert.notEqual(after.differential, before.differential);
  assert.equal(after.removedFromProfile, true);
  assert.equal(after.groupId, "g1");
  assert.deepEqual(after.edits, [{ hole: 7, field: "strokes", from: 4, to: 6, kind: "override", ...edit }]);
});

test("stats can be overridden too, and the log keeps every change in order", () => {
  const once = overrideHole(tripRound(), { hole: 1, field: "putts", to: 3, ...edit });
  const twice = overrideHole(once, { hole: 1, field: "green", to: "left", ...edit, reason: "Missed left" });
  assert.deepEqual(twice.edits?.map((e) => e.field), ["putts", "green"]);
  assert.equal(twice.holes[0].green, "left");
});

test("an override is refused without a reason, for a personal round, for a fairway on a par 3, or for a bad value", () => {
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 6, ...edit, reason: "  " }), /reason/);
  assert.throws(() => overrideHole(tripRound({ source: "personal" }), { hole: 7, field: "strokes", to: 6, ...edit }), /no organizer/);
  assert.throws(() => overrideHole(tripRound(), { hole: 3, field: "fairway", to: "left", ...edit }), /par 3/);
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 0, ...edit }), /1–20/);
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 4, ...edit }), /already/);
  assert.throws(() => overrideHole(tripRound(), { hole: 19, field: "strokes", to: 4, ...edit }), /isn't on this card/);
});

const stuck = () => liveCardFromSheet("g1", "jake", {
  strokes: par.map((p, i) => (i === 4 ? 5 : p)), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "center"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (i === 4 ? 6 : p)),
});

test("push-through uses the organizer's pick on each mismatched hole and logs it", () => {
  const result = pushThrough(stuck(), { 5: "attester" }, "cade", edit.at, "Group agreed it was 6");
  assert.equal(result.strokes[4], 6);
  assert.equal(result.strokes[0], 4);
  assert.deepEqual(result.edits, [{ hole: 5, field: "strokes", from: 5, to: 6, byProfileId: "cade", at: edit.at, reason: "Group agreed it was 6", kind: "pushThrough" }]);
});

test("push-through is refused when a mismatched hole has no pick, the reason is blank, or nothing is mismatched", () => {
  assert.throws(() => pushThrough(stuck(), {}, "cade", edit.at, "x"), /Pick a score for hole 5/);
  assert.throws(() => pushThrough(stuck(), { 5: "player" }, "cade", edit.at, " "), /reason/);
  const matching = liveCardFromSheet("g1", "jake", { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => "center"),
    penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par });
  assert.throws(() => pushThrough(matching, {}, "cade", edit.at, "x"), /already match/);
});

test("the trip-visible log lists only changes an organizer made to their own round", () => {
  const own = overrideHole(tripRound({ id: "mine", profileId: "cade" }), { hole: 7, field: "strokes", to: 5, ...edit });
  const other = overrideHole(tripRound(), { hole: 7, field: "strokes", to: 5, ...edit });
  assert.deepEqual(organizerOwnEdits([own, other]).map((x) => x.round.id), ["mine"]);
});
