import { test } from "node:test";
import assert from "node:assert/strict";
import { cityState, stateAbbreviation } from "./usStates.ts";

test("state names become their two-letter code", () => {
  assert.equal(stateAbbreviation("Texas"), "TX");
  assert.equal(stateAbbreviation(" new york "), "NY");
  assert.equal(stateAbbreviation("tx"), "TX");
  assert.equal(stateAbbreviation("Ontario"), "Ontario");
});

test("cityState joins city and abbreviated state, skipping missing parts", () => {
  assert.equal(cityState("Austin", "Texas"), "Austin, TX");
  assert.equal(cityState("Austin", null), "Austin");
  assert.equal(cityState(null, "Arizona"), "AZ");
  assert.equal(cityState(null, null), "");
});
