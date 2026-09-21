import { test } from "node:test";
import assert from "node:assert/strict";
import { stageButtonLabel, stageNote } from "./scoringStageCopy.ts";

test("each Scoring-tab stage has the right button label", () => {
  assert.equal(stageButtonLabel("upcoming"), "Begin Round");
  assert.equal(stageButtonLabel("begin"), "Begin Round");
  assert.equal(stageButtonLabel("continue"), "Continue Round");
  assert.equal(stageButtonLabel("ready"), "Continue Round");
  assert.equal(stageButtonLabel("submitted"), "View Scorecard");
});

test("each stage explains itself in one line", () => {
  const facts = { holesEntered: 7, waitingNames: [] as string[] };
  assert.equal(stageNote("none", facts), null);
  assert.equal(stageNote("begin", facts), null);
  assert.equal(stageNote("upcoming", facts), "Waiting For Round To Begin");
  assert.equal(stageNote("continue", facts), "Through 7 holes");
  assert.equal(stageNote("continue", { ...facts, holesEntered: 1 }), "Through 1 hole");
  assert.equal(stageNote("ready", facts), "Your card matches \u2014 submit your round");
  assert.equal(stageNote("submitted", { ...facts, waitingNames: ["Latto"] }), "Waiting on Latto");
  assert.equal(stageNote("submitted", { ...facts, waitingNames: ["Pete", "Kyle"] }), "Waiting on Pete & Kyle");
  assert.equal(stageNote("submitted", facts), "Round complete");
});
