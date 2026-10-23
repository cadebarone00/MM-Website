import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChange, cleanCode, currentRound, cutFrom, cutStatus, DEFAULT_TIMING, formatCode, foursomes, randomTeeSheet, roundTeeSheet, scoreTeeSheet, teeTimeLabel, tournamentPreview, type CodeTournament } from "./codeTournaments.ts";
import { rankLeaderboard } from "./golfLeaderboardOrder.ts";

const PAR = Array(18).fill(4);
const SI = Array.from({ length: 18 }, (_, i) => i + 1);
const setup = { course: { ref: "c", name: "Pine Valley", place: "Dallas, TX", par: PAR, strokeIndex: SI }, tee: null };
function tournament(scoring: "Gross" | "Net", holes: CodeTournament["holes"], cards: CodeTournament["cards"] = []): CodeTournament {
  return { id: "t", code: "K7Q4MZ", name: "Member-Guest", organizer: "a", organizerPlays: true, scoring, status: "live", createdAt: "",
    rounds: [{ number: 1, setup, date: "2026-11-01" }, { number: 2, setup, date: "2026-11-02" }],
    players: [{ profileId: "a", name: "Cam Latto", username: null, handicap: 0 }, { profileId: "b", name: "Cade Barone", username: null, handicap: 18 }, { profileId: "c", name: "Jake Hill", username: null, handicap: 5 }],
    holes, cards };
}
const card = (profileId: string, round: number, strokes: number[]) => strokes.map((s, i) => ({ profileId, round, hole: i + 1, strokes: s }));

test("codes read in two halves and clean up however they're typed", () => {
  assert.equal(formatCode("K7Q4MZ"), "K7Q-4MZ");
  assert.equal(cleanCode(" k7q-4mz "), "K7Q4MZ");
});

test("gross: totals run across rounds; Today and Thru follow the round shown; unscored players have no place yet", () => {
  const t = tournament("Gross", [...card("a", 1, Array(18).fill(4)), ...card("a", 2, [3, 3]), ...card("b", 1, Array(18).fill(5))], [{ profileId: "a", round: 1, submittedAt: "" }]);
  const ranked = rankLeaderboard(tournamentPreview(t, 2).leaderboard);
  assert.deepEqual(ranked.map((r) => [r.position, r.golfer.name, r.total, r.today, r.thru]), [
    ["1", "Cam Latto", "-2", "-2", "2"],
    ["2", "Cade Barone", "+18", "—", "—"],
    ["—", "Jake Hill", "—", "—", "—"],
  ]);
  const round1 = tournamentPreview(t, 1);
  assert.equal(round1.leaderboard[0].thru, "F", "a submitted card reads F");
  assert.equal(round1.roundStandings![0].leaderboard[0].total, "E", "round 1's own standings stop at round 1");
});

test("net: each player's handicap strokes come off the hardest holes first", () => {
  // Cade (18) shoots 5s: a stroke on every hole makes him even. Jake (5) shoots par: strokes on holes 1-5 make him -5.
  const t = tournament("Net", [...card("b", 1, Array(18).fill(5)), ...card("c", 1, [4, 4, 4, 4, 4, 4])]);
  const ranked = rankLeaderboard(tournamentPreview(t, 1).leaderboard, { net: true });
  assert.deepEqual(ranked.map((r) => [r.golfer.name, r.netTotal, r.golfer.hcp]), [["Jake Hill", "-5", 5], ["Cade Barone", "E", 18], ["Cam Latto", "—", 0]]);
  assert.equal(ranked[1].total, "+18", "gross is still there");
});

test("the round to score: today's, else the first card I haven't submitted, else the last", () => {
  const t = tournament("Gross", [], [{ profileId: "a", round: 1, submittedAt: "" }]);
  assert.equal(currentRound(t, "a", "2026-11-01"), 1);
  assert.equal(currentRound(t, "a", "2026-10-20"), 2);
  assert.equal(currentRound(t, "b", "2026-10-20"), 1);
  assert.equal(currentRound({ ...t, cards: [...t.cards, { profileId: "a", round: 2, submittedAt: "" }] }, "a", "2026-12-01"), 2);
});

test("tee sheet: even foursomes, two groups a time off 1 and 10 on 18 holes, one off 1 on nine", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  assert.deepEqual(foursomes(ids, DEFAULT_TIMING, 18).groups.map((g) => [teeTimeLabel(g.time), g.hole, g.players.length]),
    [["8:00 AM", 1, 4], ["8:00 AM", 10, 3], ["8:10 AM", 1, 3]]);
  assert.deepEqual(foursomes(ids, { first: "12:55", every: 8, start: "1&10" }, 9).groups.map((g) => [teeTimeLabel(g.time), g.hole]),
    [["12:55 PM", 1], ["1:03 PM", 1], ["1:11 PM", 1]]);
  assert.deepEqual(randomTeeSheet(ids, DEFAULT_TIMING, 18).groups.flatMap((g) => g.players).sort(), ids);
});

test("tee sheet: the organizer's groups, with players who left dropped and new players in a TBD group at the end", () => {
  const t = applyChange(tournament("Gross", []), "a", { action: "teeSheet", round: 1, teeSheet: { groups: [{ time: "09:30", hole: 10, players: ["c", "gone", "a"] }] } });
  assert.deepEqual(roundTeeSheet(t, 1).groups, [{ time: "09:30", hole: 10, players: ["c", "a"] }, { time: "", hole: 1, players: ["b"] }]);
  assert.deepEqual(roundTeeSheet(t, 2).groups, [{ time: "08:00", hole: 1, players: ["a", "b", "c"] }]);
});

test("cut: top N and ties, or a cut number, on the standings through the cut round; projected until every card is in", () => {
  // Round 1: a +2, b +1, c -1 (gross).
  const holes = [{ profileId: "a", round: 1, hole: 1, strokes: 6 }, { profileId: "b", round: 1, hole: 1, strokes: 5 }, { profileId: "c", round: 1, hole: 1, strokes: 3 }];
  const t = { ...tournament("Gross", holes), cut: { after: 1, kind: "top" as const, value: 1 } };
  assert.deepEqual([...cutStatus(t)!.missed].sort(), ["a", "b"]);
  assert.equal(cutStatus(t)!.final, false);
  assert.equal(cutFrom(t, "a", 2), false);
  const tied = { ...t, holes: [...holes.filter((h) => h.profileId !== "b"), { profileId: "b", round: 1, hole: 1, strokes: 3 }] };
  assert.deepEqual([...cutStatus(tied)!.missed], ["a"]);
  const byScore = { ...t, cut: { after: 1, kind: "score" as const, value: 1 }, cards: ["a", "b", "c"].map((profileId) => ({ profileId, round: 1, submittedAt: "" })) };
  assert.deepEqual([...cutStatus(byScore)!.missed], ["a"]);
  assert.equal(cutStatus(byScore)!.final, true);
  assert.equal(cutFrom(byScore, "a", 2), true);
  assert.equal(cutFrom(byScore, "a", 1), false);
  assert.deepEqual(roundTeeSheet(byScore, 2).groups.flatMap((g) => g.players), ["b", "c"]);
  assert.equal(cutStatus({ ...t, cut: null }), null);
});

test("tee sheet by score: worst first, leaders last, on every earlier round; nothing to go on before a round is scored", () => {
  // Round 1: a +2, b -1, c not played.
  const t = tournament("Gross", [{ profileId: "a", round: 1, hole: 1, strokes: 6 }, { profileId: "b", round: 1, hole: 1, strokes: 3 }]);
  assert.deepEqual(scoreTeeSheet(t, 2, ["a", "b", "c"], { first: "08:00", every: 10, start: "1" }, 18)?.groups, [{ time: "08:00", hole: 1, players: ["c", "a", "b"] }]);
  assert.equal(scoreTeeSheet(t, 1, ["a", "b", "c"], DEFAULT_TIMING, 18), null);
});

test("tee sheet shotgun: every group at the first tee time, one per hole", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  assert.deepEqual(foursomes(ids, { first: "09:00", every: 10, start: "shotgun" }, 18).groups.map((g) => [g.time, g.hole]), [["09:00", 1], ["09:00", 2], ["09:00", 3]]);
});
