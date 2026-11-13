import { test } from "node:test";
import assert from "node:assert/strict";
import { applySelection, catchUpSelection, responseTurn, selectionResults, selectionResponse, selectionStateFromJson, visibleSpots, type SelectionRosters, type SelectionRound, type SelectionState, type SelectionViewer } from "./matchSelection.ts";

const rosters: SelectionRosters = [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]];
const round = (type: SelectionRound["type"], perSide = 1): SelectionRound => ({ key: "1-0", number: 2, course: "Course", format: perSide === 2 ? "Fourball" : "Singles", type,
  matches: 4 / perSide, perSide, rankMinutes: 10, putForwardMinutes: 5, responseMinutes: 3 });
const org: SelectionViewer = { profileId: "org", isOrganizer: true, captainOf: null, team: null };
const capA: SelectionViewer = { profileId: "a1", isOrganizer: false, captainOf: 0, team: 0 };
const capB: SelectionViewer = { profileId: "b1", isOrganizer: false, captainOf: 1, team: 1 };
const playerB: SelectionViewer = { profileId: "b3", isOrganizer: false, captainOf: null, team: 1 };
const T0 = Date.parse("2027-04-21T18:00:00Z");
const ok = (result: { state: SelectionState | null; error: string | null }) => { assert.equal(result.error, null); return result.state!; };

test("Response: Team A puts forward first in Match 1, Team B in Match 2; only the captain on turn may place and submit", () => {
  const r = round("Response");
  let s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  assert.equal(s.deadline, new Date(T0 + 5 * 60000).toISOString(), "put-forward timer");
  assert.match(applySelection(r, rosters, s, capB, { action: "place", match: 0, team: 1, slot: 0, player: "b1" }, T0).error!, /Team A's turn/);
  assert.match(applySelection(r, rosters, s, capB, { action: "place", match: 0, team: 0, slot: 0, player: "a1" }, T0).error!, /Only Team A's captain/);
  s = ok(applySelection(r, rosters, s, capA, { action: "place", match: 0, team: 0, slot: 0, player: "a2" }, T0));
  s = ok(applySelection(r, rosters, s, capA, { action: "submit" }, T0 + 1000));
  assert.deepEqual(responseTurn(r, s.spots), { match: 0, team: 1, opening: false });
  assert.equal(s.deadline, new Date(T0 + 1000 + 3 * 60000).toISOString(), "respond timer");
  s = ok(applySelection(r, rosters, s, capB, { action: "place", match: 0, team: 1, slot: 0, player: "b2" }, T0 + 2000));
  s = ok(applySelection(r, rosters, s, capB, { action: "submit" }, T0 + 2000));
  assert.deepEqual(responseTurn(r, s.spots), { match: 1, team: 1, opening: true }, "Team B opens Match 2");
  assert.match(applySelection(r, rosters, s, capB, { action: "place", match: 1, team: 1, slot: 0, player: "b2" }, T0).error!, /already in a match/);
  assert.match(applySelection(r, rosters, s, capB, { action: "place", match: 1, team: 1, slot: 0, player: "a3" }, T0).error!, /isn't on Team B/);
});

test("Response: the other team sees a pick only once it's submitted", () => {
  const r = round("Response");
  let s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  s = ok(applySelection(r, rosters, s, capA, { action: "place", match: 0, team: 0, slot: 0, player: "a3" }, T0));
  assert.deepEqual(visibleSpots(s, capB).map(v => [v.profileId, v.hidden]), [[null, true]], "Team B can't see Team A's unsubmitted pick");
  assert.deepEqual(visibleSpots(s, capA).map(v => v.profileId), ["a3"]);
  s = ok(applySelection(r, rosters, s, capA, { action: "submit" }, T0));
  assert.deepEqual(visibleSpots(s, playerB).map(v => v.profileId), ["a3"], "revealed once submitted");
});

test("Response timers: an expired turn is filled at random from that team (keeping a chosen player) at its own deadline", () => {
  const r = round("Response", 2);
  let s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  s = ok(applySelection(r, rosters, s, capA, { action: "place", match: 0, team: 0, slot: 0, player: "a4" }, T0));
  const later = T0 + 5 * 60000 + 3 * 60000 + 1; // Team A's turn and Team B's reply both ran out
  const { state, events } = catchUpSelection(r, rosters, s, later, () => 0);
  const group = (team: 0 | 1) => state.spots.filter(spot => spot.match === 0 && spot.team === team);
  assert.ok(group(0).some(spot => spot.profileId === "a4"), "the chosen player is kept");
  assert.equal(group(0).length, 2); assert.equal(group(1).length, 2);
  assert.ok(state.spots.every(spot => spot.submitted));
  assert.ok(group(1).every(spot => spot.profileId.startsWith("b")), "only Team B's players fill Team B");
  assert.equal(events.length, 2);
  assert.deepEqual(responseTurn(r, state.spots), { match: 1, team: 1, opening: true });
});

test("Ranks: hidden from the other team until both lock in (or time runs out); a locked team can't change", () => {
  const r = round("Ranks");
  let s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  for (const [i, id] of rosters[0].entries()) s = ok(applySelection(r, rosters, s, capA, { action: "place", match: i, team: 0, slot: 0, player: id }, T0));
  assert.ok(visibleSpots(s, capB).every(v => v.hidden && v.profileId === null), "Team B sees taken spots, no names");
  assert.match(applySelection(r, rosters, s, capB, { action: "lock", team: 1 }, T0).error!, /Rank every spot first/);
  s = ok(applySelection(r, rosters, s, capA, { action: "lock", team: 0 }, T0));
  assert.match(applySelection(r, rosters, s, capA, { action: "place", match: 0, team: 0, slot: 0, player: "a2" }, T0).error!, /locked in/);
  assert.equal(s.completedAt, null);
  for (const [i, id] of [...rosters[1]].reverse().entries()) s = ok(applySelection(r, rosters, s, capB, { action: "place", match: i, team: 1, slot: 0, player: id }, T0));
  s = ok(applySelection(r, rosters, s, capB, { action: "lock", team: 1 }, T0 + 5000));
  assert.ok(s.completedAt && s.spots.every(spot => spot.submitted), "both locked → revealed and done");
  assert.deepEqual(selectionResults(r, s).map(m => [m.a[0], m.b[0]]), [["a1", "b4"], ["a2", "b3"], ["a3", "b2"], ["a4", "b1"]], "rank 1 plays rank 1");
});

test("Ranks timer: empty spots are filled at random, both teams are revealed and the round is done", () => {
  const r = round("Ranks", 2);
  let s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  s = ok(applySelection(r, rosters, s, capA, { action: "place", match: 0, team: 0, slot: 0, player: "a1" }, T0));
  const { state } = catchUpSelection(r, rosters, s, T0 + 10 * 60000, () => 0.5);
  assert.ok(state.completedAt);
  assert.equal(state.spots.length, 8);
  assert.ok(state.spots.some(spot => spot.profileId === "a1" && spot.match === 0), "the ranked player is kept");
  assert.equal(new Set(state.spots.map(spot => spot.profileId)).size, 8, "nobody twice");
});

test("Randomized: only the organizer draws; it's complete, final and uses every player once", () => {
  const r = round("Randomized");
  assert.match(applySelection(r, rosters, null, capA, { action: "randomize" }, T0).error!, /Only the organizer/);
  const s = ok(applySelection(r, rosters, null, org, { action: "randomize" }, T0, () => 0.3));
  assert.ok(s.completedAt);
  assert.equal(new Set(s.spots.map(spot => spot.profileId)).size, 8);
  assert.match(applySelection(r, rosters, s, org, { action: "randomize" }, T0).error!, /already set/);
});

test("can't start without enough players; nobody acts before the start; nothing changes once complete", () => {
  assert.match(applySelection(round("Response"), [["a1"], ["b1"]], null, org, { action: "start" }, T0).error!, /needs 4 players/);
  assert.match(applySelection(round("Response"), rosters, null, capA, { action: "start" }, T0).error!, /Only the organizer/);
  assert.match(applySelection(round("Response"), rosters, null, capA, { action: "submit" }, T0).error!, /hasn't started/);
});

test("the answer the room gets: hidden spots, turn, can't-start reason; the saved state reads back", () => {
  const r = round("Response");
  const s = ok(applySelection(r, rosters, null, org, { action: "start" }, T0));
  const answer = selectionResponse({ round: r, members: [], rosters, captains: ["a1", "b1"], teamNames: ["Maroon", "White"], state: s, viewer: capB, now: T0 });
  assert.deepEqual([answer.started, answer.completed, answer.turn?.team], [true, false, 0]);
  assert.deepEqual(selectionStateFromJson(JSON.parse(JSON.stringify(s))), s);
  assert.equal(selectionStateFromJson({ nope: 1 }), null);
});

test("setup helpers: round from Settings, two teams + captains from submittedTeams, results as member positions", async () => {
  const { selectionRoundFrom, selectionTeamsFrom, resultsAsPositions } = await import("./matchSelectionSetup.ts");
  assert.equal(selectionRoundFrom({ key: "0-0", number: 1, course: "C", format: "Singles", matches: 2, type: "Not selected", when: "" }), null);
  assert.equal(selectionRoundFrom({ key: "0-0", number: 1, course: "C", format: "Fourball", matches: 2, perSide: 2, type: "Ranks", when: "" })?.perSide, 2);
  const ids = ["m0", "m1", "m2", "m3"];
  const teams = selectionTeamsFrom({ submittedTeams: [[0, 2], [1, 3]], draftCaptains: { 0: "m2", 1: "m0" }, teamNames: ["Maroon", ""] }, ids)!;
  assert.deepEqual(teams.rosters, [["m0", "m2"], ["m1", "m3"]]);
  assert.deepEqual(teams.captains, ["m2", null], "a captain who isn't on that team doesn't count");
  assert.deepEqual(teams.teamNames, ["Maroon", "Team B"]);
  assert.equal(selectionTeamsFrom({ submittedTeams: [[0, 1, 2, 3]] }, ids), null);
  assert.deepEqual(resultsAsPositions([{ a: ["m2"], b: ["m3"] }], ids), [{ a: [2], b: [3] }]);
});
