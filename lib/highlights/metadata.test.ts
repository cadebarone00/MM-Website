import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlertLevel, parseAudience, parseEligibility, parsePreferenceCategory, parseSourceRequirement, parseTrigger, ruleMetaProblems } from "./metadata.ts";
import { emptyRuleMeta, type HighlightRule } from "./types.ts";

const value = <T,>(p: { ok: boolean; value?: T }) => (p.ok ? p.value : null);

test("competition eligibility reads every phrasing the sheet uses", () => {
  assert.deepEqual(value(parseEligibility("All trip types")), { tripTypes: ["match+individual", "match-only", "individual-only", "noncompetitive"], requiresTeamCompetition: false, requiresTournament: false });
  assert.deepEqual(value(parseEligibility("Match + Individual; Match Only")), { tripTypes: ["match+individual", "match-only"], requiresTeamCompetition: false, requiresTournament: false });
  assert.deepEqual(value(parseEligibility("Match + Individual; Match Only (team competition active)"))?.requiresTeamCompetition, true);
  assert.deepEqual(value(parseEligibility("Match + Individual; Match Only; Individual Only (tournament configured)")), { tripTypes: ["match+individual", "match-only", "individual-only"], requiresTeamCompetition: false, requiresTournament: true });
  assert.deepEqual(value(parseEligibility("  match + individual ;individual only ")), { tripTypes: ["match+individual", "individual-only"], requiresTeamCompetition: false, requiresTournament: false });
  for (const bad of ["", "Everyone", "Match Only (when sunny)", ";"]) assert.equal(parseEligibility(bad).ok, false, bad);
});

test("alert levels, categories, audiences, triggers and sources: the sheet's vocabulary, nothing guessed", () => {
  assert.deepEqual(["Big Plays", "balanced", "All", "All Highlights"].map((t) => value(parseAlertLevel(t))), ["big-plays", "balanced", "all", "all"]);
  assert.equal(parseAlertLevel("Medium").ok, false);
  assert.equal(value(parsePreferenceCategory("Match play drama")), "match-competition");
  assert.equal(value(parsePreferenceCategory("Team competition")), "match-competition");
  assert.equal(value(parsePreferenceCategory("Transportation")), "flights-transportation");
  assert.equal(value(parsePreferenceCategory("Organizer messages")), "group-announcements");
  assert.equal(parsePreferenceCategory("Gossip").ok, false);
  assert.equal(value(parseAudience("Carpool members and driver")), "transport-group");
  assert.equal(value(parseAudience("Assigned tee group")), "tee-group");
  assert.equal(parseAudience("Whoever").ok, false);
  assert.deepEqual(value(parseTrigger("24h before")), { type: "before", minutes: 1440 });
  assert.deepEqual(value(parseTrigger("30m before")), { type: "before", minutes: 30 });
  assert.deepEqual(value(parseTrigger("Evening before")), { type: "evening-before", localTime: "19:00" });
  assert.deepEqual(value(parseTrigger("On verified change")), { type: "event", event: "verified-change" });
  assert.equal(parseTrigger("Sometime").ok, false);
  assert.equal(value(parseSourceRequirement("Live feed/manual confirmation")), "live-or-manual");
});

test("each family needs its own metadata; problems name the field", () => {
  const rule = (category: HighlightRule["category"], meta: Partial<HighlightRule["meta"]>): HighlightRule =>
    ({ id: "X", category, name: "x", status: "Draft", notes: "", meta: { ...emptyRuleMeta(), ...meta }, conditionals: [] });
  assert.deepEqual(ruleMetaProblems(rule("Individual performance", { notificationCategory: "Individual performance", competitionEligibility: "All trip types", minimumAlertLevel: "Balanced" })), []);
  assert.deepEqual(ruleMetaProblems(rule("Individual performance", {})).map((p) => p.key), ["notificationCategory", "competitionEligibility", "minimumAlertLevel"]);
  assert.deepEqual(ruleMetaProblems(rule("Travel and itinerary alerts", { notificationCategory: "Flights", audience: "Flight travelers", reminderTrigger: "24h before", sourceRequirement: "Scheduled" })), []);
  assert.deepEqual(ruleMetaProblems(rule("Travel and itinerary alerts", { notificationCategory: "Flights" })).map((p) => p.key), ["audience", "reminderTrigger", "sourceRequirement"]);
});
