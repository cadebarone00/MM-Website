import { test } from "node:test";
import assert from "node:assert/strict";
import { draftBoardFor, draftCaptainsFor, draftPickError, draftTeamsAsSetup, type DraftMember, type DraftPick, type DraftSettings } from "./teamDraftPicks.ts";

const members: DraftMember[] = ["a", "b", "c", "d", "e", "f", "g", "h"].map(id => ({ profileId: id, name: id.toUpperCase() }));
const snake: DraftSettings = { teamType: "2 Teams", order: "Snake", method: "Captain's Picks" };
const pick = (pickNumber: number, profileId: string, team: number): DraftPick => ({ pickNumber, profileId, team, pickedBy: "x", pickedAt: "2027-04-20T18:00:00Z" });
const ok = { viewer: "a", isOrganizer: false, started: true, completed: false, settings: snake, picksSoFar: 0 };

test("captains sit in spot 1; the rest are available; Snake starts with Team A", () => {
  const board = draftBoardFor(members, { 0: "a", 1: "b" }, snake, []);
  assert.deepEqual(board.teams, [["a"], ["b"]]);
  assert.deepEqual(board.available, ["c", "d", "e", "f", "g", "h"]);
  assert.equal(board.turn, 0);
  assert.deepEqual(board.missingCaptains, []);
});

test("picks land on their team in pick order, leave the list, and the turn snakes A, B, B, A", () => {
  const board = draftBoardFor(members, { 0: "a", 1: "b" }, snake, [pick(2, "e", 1), pick(1, "c", 0)]);
  assert.deepEqual(board.teams, [["a", "c"], ["b", "e"]]);
  assert.ok(!board.available.includes("c") && !board.available.includes("e"));
  assert.equal(board.turn, 1, "after A, B comes B again");
});

test("the draft is done when nobody is left (2 Teams) or every team is full (Pairs, leftovers stay unpicked)", () => {
  const all = ["c", "d", "e", "f", "g", "h"].map((id, i) => pick(i + 1, id, [0, 1, 1, 0, 0, 1][i]));
  assert.equal(draftBoardFor(members, { 0: "a", 1: "b" }, snake, all).done, true);
  const pairs: DraftSettings = { ...snake, teamType: "Pairs" };
  const seven = members.slice(0, 7);
  const board = draftBoardFor(seven, { 0: "a", 1: "b", 2: "c" }, pairs, [pick(1, "d", 0), pick(2, "e", 1), pick(3, "f", 2)]);
  assert.equal(board.done, true);
  assert.deepEqual(board.available, ["g"], "the 7th player is left over");
});

test("captains must be real, different members; missing ones are reported", () => {
  assert.deepEqual(draftCaptainsFor({ 0: "a", 1: "a" }, members, 2), ["a", null]);
  assert.deepEqual(draftCaptainsFor({ 0: "zzz" }, members, 2), [null, null]);
  assert.deepEqual(draftBoardFor(members, { 0: "a" }, snake, []).missingCaptains, [1]);
});

test("pick checks: only the captain on the clock (or the organizer), the right pick number, a free player", () => {
  const captains = { 0: "a", 1: "b" };
  const board = draftBoardFor(members, captains, snake, []);
  const check = (input: Partial<typeof ok> & { player: string; pickNumber: number }) => draftPickError(board, captains, members, { ...ok, ...input });
  assert.equal(check({ player: "c", pickNumber: 1 }), null, "Team A's captain picks first");
  assert.equal(check({ viewer: "b", player: "c", pickNumber: 1 }), "It's not your pick.");
  assert.equal(check({ viewer: "z", isOrganizer: true, player: "c", pickNumber: 1 }), null, "the organizer can pick for the team on the clock");
  assert.equal(check({ player: "c", pickNumber: 2 }), "That pick was already made.");
  assert.equal(check({ player: "b", pickNumber: 1 }), "That player is already on a team.");
  assert.equal(check({ started: false, player: "c", pickNumber: 1 }), "The draft hasn't started yet.");
  assert.equal(check({ completed: true, player: "c", pickNumber: 1 }), "The draft is over.");
  assert.equal(draftPickError(draftBoardFor(members, { 0: "a" }, snake, []), { 0: "a" }, members, { ...ok, player: "c", pickNumber: 1 }), "Every team needs a captain first (Settings → Players).");
  assert.equal(check({ settings: { ...snake, method: "Duck Race" }, player: "c", pickNumber: 1 }), "This draft type doesn't use picks.");
});

test("finished teams become Settings' submittedTeams (member positions)", () => {
  const board = draftBoardFor(members, { 0: "a", 1: "b" }, snake, [pick(1, "h", 0), pick(2, "c", 1)]);
  assert.deepEqual(draftTeamsAsSetup(board, members), [[0, 7], [1, 2]]);
});

test("reading the database answer and the saved setup", async () => {
  const { savedDraftFromJson, draftSetupFrom } = await import("./teamDraftPicks.ts");
  assert.equal(savedDraftFromJson(null), null);
  assert.deepEqual(savedDraftFromJson({ startedAt: "t", completedAt: null, picks: [{ pickNumber: 1, profileId: "c", team: 0, pickedBy: "a", pickedAt: "t" }, { junk: true }] }),
    { startedAt: "t", completedAt: null, picks: [{ pickNumber: 1, profileId: "c", team: 0, pickedBy: "a", pickedAt: "t" }] });
  assert.deepEqual(draftSetupFrom({ teamSelection: "Draft", localCompetitionType: { team: "Pairs" }, draftType: "Straight", draftCaptains: { 0: "a", 1: 5 } }),
    { isDraft: true, settings: { teamType: "Pairs", order: "Straight", method: "Captain's Picks" }, captains: { 0: "a" } });
  assert.equal(draftSetupFrom({ teamSelection: "Manual" }).isDraft, false);
});

test("the room's player list from a saved draft: captains, then picks in order, then the rest", async () => {
  const { draftRoomPlayersFrom } = await import("./teamDraftPicks.ts");
  const players = draftRoomPlayersFrom({ members, captains: ["a", "b"], settings: snake, viewer: { profileId: "a", isOrganizer: false, captainOf: 0 },
    draft: { startedAt: "t", completedAt: null, picks: [pick(2, "d", 1), pick(1, "h", 0)] } });
  assert.deepEqual(players.map(p => [p.id, p.teamIndex ?? "-", p.captain ?? "-"]),
    [["a", 0, true], ["h", 0, false], ["b", 1, true], ["d", 1, false], ["c", "-", "-"], ["e", "-", "-"], ["f", "-", "-"], ["g", "-", "-"]]);
});
