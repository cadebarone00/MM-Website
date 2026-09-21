// lib/live/roundStatus.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBlocker, liveRoundStatus, requiredSubmitters, roundFinishedForPlayer, waitingOnSubmitters } from "./roundStatus.ts";
import type { HoleSubmission, ScoringPair } from "./holeSubmission.ts";

const box: ScoringPair = { format: "Singles", maroonPlayers: ["cade"], whitePlayers: ["cam"] };
const holes = [{ number: 1 }, { number: 2 }, { number: 3 }];
const entry = (player: string, hole: number, ownScore: number, opponentScore: number): HoleSubmission => ({
  player, hole, ownScore, opponentScore, putts: 2, fairway: "hit", green: "hit", submittedAt: `2027-01-01T10:0${hole}:00Z`,
});
const card = (player: string, own: number, opp: number, upTo = 3) => holes.slice(0, upTo).map((h) => entry(player, h.number, own, opp));

test("a card with no entries is waiting, names the first empty hole, and has no totals", () => {
  const status = liveRoundStatus(box, "cade", holes, []);
  assert.equal(status.state, "waiting");
  assert.deepEqual(status.blocker, { kind: "empty", hole: 1 });
  assert.equal(status.holeStates[1], "empty");
  assert.equal(status.yourTotal, null);
  assert.equal(status.opponentTotal, null);
});

test("when you have entered every hole but your scorer hasn't, the card is still waiting and shows your totals", () => {
  const status = liveRoundStatus(box, "cade", holes, card("cade", 4, 5));
  assert.equal(status.state, "waiting");
  assert.deepEqual(status.blocker, { kind: "waiting", hole: 1 });
  assert.equal(status.yourTotal, 12);
  assert.equal(status.opponentTotal, 15);
});

test("a disagreeing hole makes the card red and names that hole", () => {
  const cam = card("cam", 5, 4).map((e) => (e.hole === 2 ? { ...e, ownScore: 7 } : e));
  const status = liveRoundStatus(box, "cade", holes, [...card("cade", 4, 5), ...cam]);
  assert.equal(status.state, "disputed");
  assert.deepEqual(status.disputedHoles, [2]);
  assert.deepEqual(status.blocker, { kind: "disputed", hole: 2 });
  assert.equal(status.holeStates[1], "confirmed");
  assert.equal(status.holeStates[2], "disputed");
});

test("every hole matching makes the card green, and a later correction turns red back to green", () => {
  const matching = [...card("cade", 4, 5), ...card("cam", 5, 4)];
  const green = liveRoundStatus(box, "cade", holes, matching);
  assert.equal(green.state, "match");
  assert.equal(green.blocker, null);
  assert.equal(green.yourTotal, 12);
  const wrong = [...card("cade", 4, 5), ...card("cam", 5, 4).map((e) => (e.hole === 2 ? { ...e, ownScore: 7 } : e))];
  assert.equal(liveRoundStatus(box, "cade", holes, wrong).state, "disputed");
  const fixed = [...wrong, { ...entry("cam", 2, 5, 4), submittedAt: "2027-01-01T11:00:00Z" }];
  assert.equal(liveRoundStatus(box, "cade", holes, fixed).state, "match");
});

test("blockers read as plain sentences", () => {
  assert.equal(describeBlocker({ kind: "disputed", hole: 5 }, "Latto"), "Hole 5 doesn't match — talk with Latto");
  assert.equal(describeBlocker({ kind: "empty", hole: 7 }, "Latto"), "Hole 7 is not entered");
  assert.equal(describeBlocker({ kind: "waiting", hole: 10 }, "Latto"), "Waiting for Latto to enter hole 10");
  assert.equal(describeBlocker(null, "Latto"), null);
});

test("who must submit: you and your opposing-position scorer, never your partner; all four in Foursome", () => {
  assert.deepEqual(requiredSubmitters(box, "cade"), ["cade", "cam"]);
  const fourball: ScoringPair = { format: "Fourball", maroonPlayers: ["cade", "collin"], whitePlayers: ["cam", "drew"] };
  assert.deepEqual(requiredSubmitters(fourball, "cade"), ["cade", "cam"]);
  assert.deepEqual(requiredSubmitters(fourball, "collin"), ["collin", "drew"]);
  const foursome: ScoringPair = { ...fourball, format: "Foursome" };
  assert.deepEqual(requiredSubmitters(foursome, "cade"), ["cade", "collin", "cam", "drew"]);
});

test("a round is finished for a player only when everyone required has submitted", () => {
  assert.deepEqual(waitingOnSubmitters(box, "cade", ["cade"]), ["cam"]);
  assert.equal(roundFinishedForPlayer(box, "cade", ["cade"]), false);
  assert.equal(roundFinishedForPlayer(box, "cade", ["cade", "cam"]), true);
});
