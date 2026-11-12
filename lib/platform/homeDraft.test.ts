import { test } from "node:test";
import assert from "node:assert/strict";
import { homeDraftTeamsReady, homeDraftHasSchedule } from "./homeDraft";

test("match drafts require all players and both teams, never just a passed draft time", () => {
  assert.equal(homeDraftTeamsReady(0, []), false);
  assert.equal(homeDraftTeamsReady(4, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "B" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "A" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "0", name: "Alex", team: "B" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "B" }]), true);
});

test("draft schedules need both a date and a valid time", () => {
  assert.equal(homeDraftHasSchedule("", ""), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", ""), false);
  assert.equal(homeDraftHasSchedule("", "18:00"), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", "25:00"), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", "18:00"), true);
});
