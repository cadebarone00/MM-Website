import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTestSeason, type TestSeasonStatusInput } from "./testSeasonStatus.ts";

const box = { id: "b1", round: 1, boxNumber: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"] };
const holes = (player: string, n: number) => Array.from({ length: n }, (_, i) => ({ round: 1, player_slug: player, hole: i + 1 }));
const base: TestSeasonStatusInput = { boxes: [box], confirmedHoles: [], submissions: [], archiveStatuses: [], officialStates: [], handicapCounts: {} };
const nameOf = (slug: string) => slug.toUpperCase();

test("a match with nothing scored yet says so", () => {
  const [match] = summarizeTestSeason(base, nameOf);
  assert.equal(match.label, "Round 1 \u00b7 Match 1 \u00b7 Singles");
  assert.equal(match.matchStatus, "Not started");
  assert.equal(match.hint, "No holes scored yet.");
  assert.deepEqual(match.players.map((p) => [p.name, p.holesConfirmed, p.submitted]), [["CAM", 0, false], ["DREW", 0, false]]);
});

test("mid-round it reports how many holes have matched", () => {
  const [match] = summarizeTestSeason({ ...base, confirmedHoles: [...holes("cam", 7), ...holes("drew", 7)], officialStates: [{ match_box_id: "b1", status: "live", leader: "maroon", margin: 1, thru: 7 }] }, nameOf);
  assert.equal(match.matchStatus, "In progress");
  assert.equal(match.hint, "Scoring in progress \u2014 7 of 18 holes matched so far.");
});

test("once every hole matches it names who still has to press Submit Round", () => {
  const all = { ...base, confirmedHoles: [...holes("cam", 18), ...holes("drew", 18)] };
  assert.equal(summarizeTestSeason(all, nameOf)[0].hint, "All holes match \u2014 waiting on CAM & DREW to press Submit Round.");
  const oneIn = { ...all, submissions: [{ match_box_id: "b1", player_slug: "cam" }] };
  assert.equal(summarizeTestSeason(oneIn, nameOf)[0].hint, "All holes match \u2014 waiting on DREW to press Submit Round.");
});

test("when everyone has submitted, the match is ready for Tiger's closeout, and official rounds show their archive and handicap effect", () => {
  const input: TestSeasonStatusInput = {
    ...base,
    confirmedHoles: [...holes("cam", 18), ...holes("drew", 18)],
    submissions: [{ match_box_id: "b1", player_slug: "cam" }, { match_box_id: "b1", player_slug: "drew" }],
    archiveStatuses: [{ round: 1, player_slug: "cam", status: "submitted" }, { round: 1, player_slug: "drew", status: "submitted" }],
    officialStates: [{ match_box_id: "b1", status: "complete", leader: "maroon", margin: 3, thru: 16 }],
    handicapCounts: { "1:cam": true, "1:drew": false },
  };
  const [match] = summarizeTestSeason(input, nameOf);
  assert.equal(match.matchStatus, "Decided");
  assert.equal(match.hint, "Everyone has submitted \u2014 ready for you to Close Out Match in the Tiger Center.");
  assert.deepEqual(match.players.map((p) => [p.archiveStatus, p.countsForHandicap]), [["submitted", true], ["submitted", false]]);
});

test("a closed-out match says it is final", () => {
  const [match] = summarizeTestSeason({ ...base, officialStates: [{ match_box_id: "b1", status: "closed_out", leader: "white", margin: 2, thru: 16 }] }, nameOf);
  assert.equal(match.matchStatus, "Closed out");
  assert.equal(match.hint, "Closed out \u2014 the match is final and wagers are settled.");
});
