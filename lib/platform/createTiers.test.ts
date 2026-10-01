import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATE_TIERS, tierFromParam, tierSurveyHref } from "./createTiers.ts";

test("three tiers in order, all free during beta", () => {
  assert.deepEqual(CREATE_TIERS.map((t) => [t.key, t.label, t.name, t.price]), [
    ["individual", "Tier 1", "Individual", "Free during beta"],
    ["match-play", "Tier 2", "Match Play", "Free during beta"],
    ["individual-match-play", "Tier 3", "Individual + Match Play", "Free during beta"],
  ]);
});

test("each tier opens the survey with its key", () => {
  assert.deepEqual(CREATE_TIERS.map(tierSurveyHref), [
    "/tournaments/new?tier=individual",
    "/tournaments/new?tier=match-play",
    "/tournaments/new?tier=individual-match-play",
  ]);
});

test("the survey only recognizes known tiers", () => {
  assert.equal(tierFromParam("match-play")?.name, "Match Play");
  assert.equal(tierFromParam("Match-Play"), null);
  assert.equal(tierFromParam("gold"), null);
  assert.equal(tierFromParam(undefined), null);
  assert.equal(tierFromParam(["match-play", "individual"])?.name, "Match Play");
});
