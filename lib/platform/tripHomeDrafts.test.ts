import assert from "node:assert/strict";
import test from "node:test";
import { homeDrafts, savedTeamDraft } from "./tripHomeDrafts";

const players = [{ name: "Cam Latto" }, { name: "Cade Barone" }, { name: "Drew Weisser" }, { name: "Joe Smith" }];
const base = { setup: {}, players, rounds: [], playedThrough: 0, teamNames: ["Team A", "Team B"], now: "2026-04-20T09:00:00" };

test("saved team draft settings read the way the website's saved trip reads them", () => {
  assert.deepEqual(savedTeamDraft({ teamSelection: "Draft", draftDate: "2026-04-21", draftTime: "18:00", draftType: "Straight", draftMethod: "Duck Race" }, "2 Teams"),
    { teamType: "2 Teams", selection: "Draft", date: "2026-04-21", time: "18:00", type: "Straight", method: "Duck Race" });
  assert.deepEqual(savedTeamDraft({}, null), { teamType: null, selection: null, date: "", time: "", type: "Snake", method: "Captain's Picks" });
});

test("no team competition and no match rounds: no draft cards", () => {
  const drafts = homeDrafts({ ...base, competitionTypes: { individual: "Stroke Play", team: null }, team: undefined });
  assert.deepEqual(drafts, { team: null, match: null, noDrafts: true });
});

test("2 Teams with a scheduled draft and no teams yet: the Team Draft countdown", () => {
  const team = savedTeamDraft({ teamSelection: "Draft", draftDate: "2026-04-21", draftTime: "18:00" }, "2 Teams");
  const drafts = homeDrafts({ ...base, competitionTypes: { individual: null, team: "2 Teams" }, team });
  assert.equal(drafts.team?.kind, "board");
  if (drafts.team?.kind === "board") {
    assert.equal(drafts.team.countdown.scheduled, true);
    assert.equal(drafts.team.countdown.target, "2026-04-21T18:00");
  }
});

test("2 Teams picked by hand (no draft), teams not set: Set up team selection", () => {
  const team = savedTeamDraft({ teamSelection: "Manual" }, "2 Teams");
  const drafts = homeDrafts({ ...base, competitionTypes: { individual: null, team: "2 Teams" }, team });
  assert.deepEqual(drafts.team, { kind: "status", text: "Set up team selection", action: "Set up teams" });
});

test("teams already submitted: Team Draft goes away (Players becomes Teams)", () => {
  const team = savedTeamDraft({ teamSelection: "Draft", draftDate: "2026-04-21", draftTime: "18:00" }, "2 Teams");
  const drafts = homeDrafts({ ...base, setup: { submittedTeams: [[0, 1], [2, 3]] }, competitionTypes: { individual: null, team: "2 Teams" }, team });
  assert.equal(drafts.team, null);
});

test("Match Play with no rounds yet: add match-play rounds", () => {
  const drafts = homeDrafts({ ...base, competitionTypes: { individual: "Match Play", team: null }, team: undefined });
  assert.equal(drafts.match?.noRounds, true);
  assert.equal(drafts.noDrafts, false);
});
