import test from "node:test";
import assert from "node:assert/strict";
import { draftBoard, draftWhenLabel, ordinal, teamDraftSize, teamDraftTeamCount, teamDraftTurn, teamLetter, type TeamDraft } from "./teamDraft.ts";

const draft = (changes: Partial<TeamDraft> = {}): TeamDraft => ({ teamType: "2 Teams", selection: "Draft", date: "2027-05-21", time: "21:15", type: "Snake", ...changes });

test("ordinal days read like a calendar", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
});

test("the draft's day and time as the Draftboard says it", () => {
  assert.equal(draftWhenLabel("2027-05-21", "21:15"), "Fri, May 21st @ 09:15 PM");
  assert.equal(draftWhenLabel("2027-05-03", "08:05"), "Mon, May 3rd @ 08:05 AM");
  assert.equal(draftWhenLabel("2027-05-03", "00:30"), "Mon, May 3rd @ 12:30 AM");
  assert.equal(draftWhenLabel("2027-05-03", ""), "Mon, May 3rd");
});

test("the Draftboard shows only for a team draft that hasn't started", () => {
  assert.deepEqual(draftBoard(draft(), "2027-05-20T10:00"), { when: "Fri, May 21st @ 09:15 PM", target: "2027-05-21T21:15" });
  assert.equal(draftBoard(draft(), "2027-05-21T21:15"), null, "gone once the draft starts");
  assert.equal(draftBoard(draft({ selection: "Random" }), "2027-05-20T10:00"), null);
  assert.equal(draftBoard(draft({ selection: null }), "2027-05-20T10:00"), null);
  assert.equal(draftBoard(draft({ teamType: null }), "2027-05-20T10:00"), null, "no team competition");
  assert.equal(draftBoard(undefined, "2027-05-20T10:00"), null);
});

test("no draft date yet: the Draftboard shows without a countdown; the clock not known yet still shows it", () => {
  assert.deepEqual(draftBoard(draft({ date: "", time: "" }), "2027-05-20T10:00"), { when: null, target: null });
  assert.deepEqual(draftBoard(draft(), null), { when: "Fri, May 21st @ 09:15 PM", target: "2027-05-21T21:15" });
  assert.deepEqual(draftBoard(draft({ time: "" }), "2027-05-20T10:00"), { when: "Fri, May 21st", target: "2027-05-21T00:00" });
});

test("team sizes and counts for 2 Teams, Pairs, 3-Ball, 4-Ball", () => {
  assert.deepEqual(["2 Teams", "Pairs", "3-Ball", "4-Ball"].map(teamDraftSize), [null, 2, 3, 4]);
  assert.deepEqual([teamDraftTeamCount("2 Teams", 9), teamDraftTeamCount("Pairs", 7), teamDraftTeamCount("3-Ball", 10), teamDraftTeamCount("4-Ball", 16)], [2, 3, 3, 4]);
});

test("pick order: Snake turns around each round, Straight repeats, full teams are skipped", () => {
  const order = (kind: "Snake" | "Straight", teams: number, capacity: number, start = Array(teams).fill(0)) => {
    const counts = [...start]; const picks: string[] = [];
    for (let team = teamDraftTurn(kind, counts, start, capacity); team !== null && picks.length < 40; team = teamDraftTurn(kind, counts, start, capacity)) { picks.push(teamLetter(team)); counts[team]++; }
    return picks.join("");
  };
  assert.equal(order("Snake", 4, 2, [1, 1, 1, 1]), "ABCD");             // Pairs with captains: one pick each
  assert.equal(order("Snake", 3, 3, [1, 1, 1]), "ABCCBA");              // 3-Ball with captains
  assert.equal(order("Straight", 3, 3, [1, 1, 1]), "ABCABC");
  assert.equal(order("Snake", 2, 3).slice(0, 6), "ABBAAB");             // 2 Teams style, no captains
  assert.equal(teamDraftTurn("Snake", [2, 2], [0, 0], Infinity), 0);     // 2 Teams never fills up
});

test("players already on a team count as picks (half-picked draft)", () => {
  // 2 Teams, Snake: A and B already have one each → round 2 starts with B.
  assert.equal(teamDraftTurn("Snake", [1, 1], [0, 0], Infinity), 1);
  assert.equal(teamDraftTurn("Snake", [1, 2], [0, 0], Infinity), 0);     // A, B, B done → A again
  assert.equal(teamDraftTurn("Snake", [2, 2], [0, 0], 2), null);         // everyone full → draft over
});
