/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameName, holesLabel, inviteLine, shownJoinCode, statText, typedJoinCode } from "./play.ts";

test("join code typing: any case, dashes and spaces dropped, 6 max, dash shown after 3", () => {
  assert.equal(typedJoinCode("k7q-4mz"), "K7Q4MZ");
  assert.equal(typedJoinCode(" k7 q4mzXX "), "K7Q4MZ");
  assert.equal(shownJoinCode("K7Q"), "K7Q");
  assert.equal(shownJoinCode("K7Q4M"), "K7Q-4M");
});

test("holes labels match the website", () => {
  assert.equal(holesLabel("front"), "Front 9");
  assert.equal(holesLabel("back"), "Back 9");
  assert.equal(holesLabel("18"), "18 holes");
  assert.equal(holesLabel(null), "18 holes");
});

test("invite line uses the shared game names", () => {
  const line = inviteLine({ roundId: "r", hostName: "Cam", setup: { course: { name: "Eagle Pointe" }, game: { id: "skins" } } });
  assert.equal(line.host, "Cam");
  assert.equal(line.course, "Eagle Pointe");
  assert.equal(line.game, gameName("skins"));
  assert.ok(line.game);
  assert.equal(inviteLine({ roundId: "r", hostName: "Cam", setup: { course: { name: "X" }, game: null } }).game, null);
  assert.equal(gameName("not-a-game"), null);
});

test("stats show one decimal or ?", () => {
  assert.equal(statText(12.345), "12.3");
  assert.equal(statText(null), "?");
  assert.equal(statText(undefined), "?");
  assert.equal(statText(Number.NaN), "?");
});
