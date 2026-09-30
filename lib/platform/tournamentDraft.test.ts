import assert from "node:assert/strict";
import test from "node:test";
import { createTournamentDraft, draftSetup, INITIAL_DRAFT_INPUT, validateDraftInput, type DraftInput } from "./tournamentDraft.ts";
const valid = (overrides: Partial<DraftInput> = {}): DraftInput => ({ ...INITIAL_DRAFT_INPUT, name: " Autumn Cup ", startDate: "2026-10-01", endDate: "2026-10-03", ...overrides });
test("minimal individual draft needs no roster, courses, rules, branding or formats", () => {
  const result = createTournamentDraft(valid());
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.draft.basics.name, "Autumn Cup");
  assert.deepEqual(result.draft.teams, []);
  assert.deepEqual(result.draft.players, []);
  assert.deepEqual(result.draft.scoring, { mode: null, rules: null });
  assert.equal(result.draft.branding, null);
  assert.ok(result.draft.rounds.every(round => round.format === null && round.courseId === null && round.day === null));
  const setup = draftSetup(result.draft);
  assert.equal(setup.percent, 17);
  assert.equal(setup.sections.find(section => section.name === "Publish")?.status, "Locked");
  assert.equal(setup.sections.find(section => section.name === "Teams")?.required, false);
});
test("teams require distinct names but no colors or assignments", () => {
  for (const teamNames of [[" A ", "a"], ["A", ""]]) assert.ok(validateDraftInput(valid({ competitionType: "teams", teamNames })).some(error => error.field === "teamNames"));
  const result = createTournamentDraft(valid({ competitionType: "teams", teamNames: [" North ", "South"], scoringMode: "match_play", formats: ["Singles", "Fourball", "Foursome"] }));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.draft.teams[0].name, "North");
  assert.equal(result.draft.teams[0].color, null);
  const setup = draftSetup(result.draft);
  assert.equal(setup.percent, 29);
  assert.equal(setup.sections.find(section => section.name === "Teams")?.status, "Needs Attention");
  assert.equal(setup.sections.find(section => section.name === "Rules")?.status, "Needs Attention");
});
test("invalid essentials are rejected", () => {
  for (const overrides of [{ startDate: "2026-02-30" }, { endDate: "2026-09-30" }, { endDate: "2026-10-15" }, { timezone: "Not/AZone" }, { expectedPlayerCount: 1 }, { expectedPlayerCount: 65 }, { expectedPlayerCount: 2.5 }, { roundCount: 0 }, { roundCount: 21 }]) assert.equal(createTournamentDraft(valid(overrides)).ok, false, JSON.stringify(overrides));
});
test("unsupported scoring stays TBD without broadening the live model", () => {
  assert.equal(createTournamentDraft(valid({ scoringMode: "match_play" })).ok, false);
  assert.equal(createTournamentDraft(valid({ competitionType: "teams", teamNames: ["A", "B", "C"], scoringMode: "match_play" })).ok, false);
  assert.equal(createTournamentDraft(valid({ competitionType: "teams", teamNames: ["A", "B", "C"] })).ok, true);
  assert.equal(createTournamentDraft(valid({ formats: ["Singles", null, null] })).ok, false);
  assert.equal(createTournamentDraft(valid({ formats: [] })).ok, false);
});
test("optional branding does not affect required completion and is copied", () => {
  const branding = { primary: "#500001", secondary: "#ffffff", accent: "#c7a55e", logoUrl: null };
  const result = createTournamentDraft(valid({ branding }));
  assert.ok(result.ok);
  if (!result.ok) return;
  branding.primary = "#000000";
  assert.equal(result.draft.branding?.primary, "#500001");
  assert.equal(draftSetup(result.draft).percent, 17);
});
