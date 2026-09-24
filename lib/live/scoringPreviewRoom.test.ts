import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPreviewHole, applyPreviewRoundSubmit, emptyRoom, expandPreviewTeammates, officialPreviewPlayers, PREVIEW_PARS, type PreviewRoom } from "./scoringPreviewRoom.ts";
import type { HoleSubmission, ScoringPair } from "./holeSubmission.ts";

const box: ScoringPair = { format: "Singles", maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"] };
const draft = (own: number, opp: number) => ({ ownScore: own, opponentScore: opp, putts: 2, fairway: "hit" as const, green: "hit" as const });
const entry = (player: string, hole: number, own: number, opp: number): HoleSubmission => ({ ...draft(own, opp), player, hole, submittedAt: "" });

function fullRound(): PreviewRoom {
  let room = emptyRoom();
  for (let hole = 1; hole <= 18; hole++) {
    const par3 = PREVIEW_PARS[hole - 1] === 3;
    for (const [player, own, opp] of [["cam-latto", 4, 5], ["cade-barone", 5, 4]] as const) {
      const result = applyPreviewHole(box, room, player, { ...entry(player, hole, own, opp), fairway: par3 ? null : "hit" }, `2027-01-01T10:${String(hole).padStart(2, "0")}:00Z`);
      assert.equal(result.error, undefined);
      room = result.room;
    }
  }
  return room;
}

test("a hole entry is validated and a re-entry replaces the earlier one", () => {
  const first = applyPreviewHole(box, emptyRoom(), "cam-latto", entry("cam-latto", 1, 4, 5), "2027-01-01T10:00:00Z");
  assert.equal(first.error, undefined);
  assert.equal(first.room.submissions.length, 1);
  const again = applyPreviewHole(box, first.room, "cam-latto", entry("cam-latto", 1, 6, 5), "2027-01-01T10:05:00Z");
  assert.equal(again.room.submissions.length, 1);
  assert.equal(again.room.submissions[0].ownScore, 6);
  assert.match(applyPreviewHole(box, emptyRoom(), "cam-latto", { ...entry("cam-latto", 1, 4, 5), putts: null }, "x").error ?? "", /Not all information/);
  assert.match(applyPreviewHole(box, emptyRoom(), "cam-latto", entry("cam-latto", 19, 4, 5), "x").error ?? "", /Not all information/);
});

test("Submit Round is refused with a reason until every hole matches", () => {
  assert.match(applyPreviewRoundSubmit(box, emptyRoom(), "cam-latto").error ?? "", /Hole 1 is not entered/);
  let room = emptyRoom();
  for (let hole = 1; hole <= 18; hole++) room = applyPreviewHole(box, room, "cam-latto", { ...entry("cam-latto", hole, 4, 5), fairway: PREVIEW_PARS[hole - 1] === 3 ? null : "hit" }, `2027-01-01T10:${String(hole).padStart(2, "0")}:00Z`).room;
  assert.match(applyPreviewRoundSubmit(box, room, "cam-latto").error ?? "", /Waiting for your scorer to enter hole 1/);
});

test("Submit Round works once the card is green, is idempotent, and is official only when both have submitted", () => {
  const room = fullRound();
  const first = applyPreviewRoundSubmit(box, room, "cam-latto");
  assert.equal(first.error, undefined);
  assert.deepEqual(first.room.submitted, ["cam-latto"]);
  assert.equal(first.official, false);
  assert.deepEqual(first.waitingOn, ["cade-barone"]);
  assert.deepEqual(officialPreviewPlayers(box, first.room), []);
  const again = applyPreviewRoundSubmit(box, first.room, "cam-latto");
  assert.deepEqual(again.room.submitted, ["cam-latto"]);
  const both = applyPreviewRoundSubmit(box, first.room, "cade-barone");
  assert.equal(both.official, true);
  assert.deepEqual(officialPreviewPlayers(box, both.room).sort(), ["cade-barone", "cam-latto"]);
});

test("after Submit Round the player's entries are locked, and a scorer's later edit never un-submits anyone", () => {
  const submitted = applyPreviewRoundSubmit(box, fullRound(), "cam-latto").room;
  assert.match(applyPreviewHole(box, submitted, "cam-latto", entry("cam-latto", 5, 6, 5), "x").error ?? "", /Your round is submitted/);
  const scorerEdit = applyPreviewHole(box, submitted, "cade-barone", { ...entry("cade-barone", 5, 9, 4), fairway: "hit" }, "2027-01-02T00:00:00Z");
  assert.equal(scorerEdit.error, undefined);
  assert.deepEqual(scorerEdit.room.submitted, ["cam-latto"]);
  assert.match(applyPreviewRoundSubmit(box, scorerEdit.room, "cade-barone").error ?? "", /Hole 5 doesn't match/);
});

test("in a Fourball/Foursome preview a lead player's teammate counts as submitted along with them", () => {
  assert.deepEqual(expandPreviewTeammates("Singles", ["cam-latto"]), ["cam-latto"]);
  assert.deepEqual(expandPreviewTeammates("Foursome", ["cam-latto"]), ["cam-latto", "pete-peabody"]);
  assert.deepEqual(expandPreviewTeammates("Fourball", ["cade-barone", "cam-latto"]), ["cade-barone", "kyle-schnabel", "cam-latto", "pete-peabody"]);
});
