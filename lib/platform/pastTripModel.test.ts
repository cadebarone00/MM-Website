import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResultChanges, checkDraft, draftFromJson, emptyDraft, pastTripResults, type TripDraft } from "./pastTripModel.ts";

const TODAY = "2026-11-09";

/** A small team trip as someone would tap it into the walkthrough: Fourball then Singles. */
function teamDraft(): TripDraft {
  const d = emptyDraft();
  Object.assign(d, { kind: "team", name: "Lake Trip", place: "Lake Geneva, WI", startDate: "2025-06-06", endDate: "2025-06-07", teamNames: ["Reds", "Blues"] });
  d.players = [
    { id: "a", name: "Ann", handicap: 5, team: 0 }, { id: "b", name: "Ben", handicap: 9, team: 0 },
    { id: "c", name: "Cal", handicap: 7, team: 1 }, { id: "d", name: "Dee", handicap: null, team: 1 },
  ];
  d.rounds = [{ number: 1, date: "2025-06-06", course: "Brute", format: "Fourball", par: null }, { number: 2, date: "2025-06-07", course: "Highlands", format: "Singles", par: null }];
  d.matches = [
    { id: "m1", round: 1, sides: [["a", "b"], ["c", "d"]], winner: 0 },
    { id: "m2", round: 2, sides: [["a"], ["c"]], winner: "halved" },
    { id: "m3", round: 2, sides: [["b"], ["d"]], winner: 1 },
  ];
  return d;
}

test("walkthrough draft: a correctly tapped-in team trip passes and scores like the spreadsheet would", () => {
  const { trip, problems } = checkDraft(teamDraft(), TODAY);
  assert.deepEqual(problems, []);
  assert.deepEqual(pastTripResults(trip!).teamTotals, [1.5, 1.5]);
  assert.equal(pastTripResults(trip!).teamWinner, "tied");
});

test("walkthrough draft: each mistake is caught at the step to fix it", () => {
  const d = teamDraft();
  d.endDate = "2026-12-01";                                   // not finished
  d.players[3].team = null;                                   // no team
  d.rounds[1].date = "2025-06-01";                            // before the trip starts
  d.matches[1].sides = [["a", "b"], ["c"]];                   // two a side in Singles
  d.matches[2].sides = [["a"], ["d"]];                        // Ann twice in round 2
  d.matches[0].winner = null;                                 // no winner
  const steps = (step: string) => checkDraft(d, TODAY).problems.filter((p) => p.step === step).map((p) => p.message);
  assert.ok(steps("basics").includes("This trip hasn't finished yet. Only past trips can be imported."));
  assert.ok(steps("players").includes("Pick Dee's team."));
  assert.ok(steps("rounds").includes("Round 2's date isn't between the trip's start and end dates."));
  assert.ok(steps("matches").includes("Round 2, match 1: Singles is one player a side."));
  assert.ok(steps("matches").includes("Round 2, match 2: Ann is already in a match in round 2."));
  assert.ok(steps("matches").includes("Round 1, match 1: pick who won."));
  assert.equal(checkDraft(d, TODAY).trip, null);
});

test("walkthrough draft: Both trips need a par and keep scores out of shared-ball rounds", () => {
  const d = teamDraft();
  d.kind = "both";
  d.method = "Lowest net total";
  d.rounds.push({ number: 3, date: "2025-06-07", course: "Brute", format: "Alternate Shot", par: null });
  d.scores = [{ round: 1, player: "a", total: 80, holes: null }, { round: 3, player: "a", total: 85, holes: null }];
  const messages = checkDraft(d, TODAY).problems.map((p) => p.message);
  assert.ok(messages.includes("Round 1: add the course par."));
  assert.ok(messages.includes("Round 3, Ann: Alternate Shot has no individual scores."));
  d.rounds.forEach((r) => { r.par = 72; });
  d.scores = [{ round: 1, player: "a", total: null, holes: Array(18).fill(4) }];
  const { trip } = checkDraft(d, TODAY);
  assert.equal(trip!.scores[0].total, 72); // holes add up when no total is typed
});

test("draftFromJson refuses things that aren't a draft", () => {
  assert.ok(draftFromJson(JSON.parse(JSON.stringify(teamDraft()))));
  assert.equal(draftFromJson({ ...teamDraft(), kind: "golf" }), null);
  assert.equal(draftFromJson({ ...teamDraft(), players: "everyone" }), null);
  assert.equal(draftFromJson(null), null);
});

test("fixing results: a player changes only their own score; the organizer can change scores and winners", () => {
  const d = teamDraft();
  d.kind = "both"; d.method = "Lowest gross total"; d.rounds.forEach((r) => { r.par = 72; });
  d.scores = [{ round: 1, player: "a", total: 80, holes: null }, { round: 1, player: "c", total: 82, holes: null }];
  const trip = checkDraft(d, TODAY).trip!;
  const mine = applyResultChanges(trip, { scores: [{ round: 1, player: "a", total: 78, holes: null }], matches: [] }, { memberId: "a", organizer: false }, TODAY);
  assert.ok(mine.ok && mine.trip.scores.find((s) => s.player === "a")!.total === 78);
  assert.deepEqual(applyResultChanges(trip, { scores: [{ round: 1, player: "c", total: 70, holes: null }], matches: [] }, { memberId: "a", organizer: false }, TODAY),
    { ok: false, error: "You can only change your own scores." });
  assert.equal(applyResultChanges(trip, { scores: [], matches: [{ index: 0, winner: 1 }] }, { memberId: "a", organizer: false }, TODAY).ok, false);
  const org = applyResultChanges(trip, { scores: [], matches: [{ index: 0, winner: 1 }] }, { memberId: "a", organizer: true }, TODAY);
  assert.ok(org.ok && pastTripResults(org.trip).teamTotals![1] === 2.5); // Blues: the Fourball (1) + half (0.5) + Dee's win (1)
  // A fix still has to pass the checks: a score in round 2 is fine (Singles is own ball); one that's too low isn't.
  assert.equal(applyResultChanges(trip, { scores: [{ round: 1, player: "a", total: 5, holes: null }], matches: [] }, { memberId: "a", organizer: true }, TODAY).ok, false);
  // Both totals cleared removes the score.
  const removed = applyResultChanges(trip, { scores: [{ round: 1, player: "a", total: null, holes: null }], matches: [] }, { memberId: "a", organizer: false }, TODAY);
  assert.ok(removed.ok && !removed.trip.scores.some((s) => s.player === "a"));
});

/** An individual trip with one full hole-by-hole card: par-72 layout, Ann shoots 76 with stats. */
function statsDraft(): TripDraft {
  const d = emptyDraft();
  Object.assign(d, { kind: "individual", name: "Stats Trip", place: "Kohler, WI", startDate: "2025-06-06", endDate: "2025-06-06", method: "Lowest gross total" });
  d.players = [{ id: "a", name: "Ann", handicap: 5, team: null }, { id: "b", name: "Ben", handicap: 9, team: null }];
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  d.rounds = [{ number: 1, date: "2025-06-06", course: "Straits", format: "Stroke Play", par: null, holePars: pars }];
  const holes = pars.map((p, h) => p + (h < 4 ? 1 : 0)); // bogeys on 1-4: 76
  d.scores = [{ round: 1, player: "a", total: null, holes, putts: holes.map(() => 2),
    fairway: pars.map((p, h) => p === 3 ? null : h % 2 ? "center" : "left"), green: pars.map((_, h) => h < 9 ? "center" : "right") }];
  return d;
}

test("stats: hole pars set the round par; a full card with putts, fairways and greens passes", () => {
  const { trip, problems } = checkDraft(statsDraft(), TODAY);
  assert.deepEqual(problems, []);
  assert.equal(trip!.rounds[0].par, 72);
  assert.equal(trip!.scores[0].total, 76);
  assert.equal(trip!.scores[0].putts!.length, 18);
});

test("stats: impossible entries are refused", () => {
  const d = statsDraft();
  d.scores[0].putts![0] = 6;                 // 6 putts on a 5
  d.scores[0].fairway![2] = "center";        // hole 3 is a par 3
  d.rounds[0].holePars![5] = 9;              // a par 9
  d.scores[0].holes![17] = null;             // stats on a hole with no score
  const messages = checkDraft(d, TODAY).problems.map((p) => p.message);
  assert.ok(messages.includes("Round 1, Ann: hole 1 has more putts than strokes."));
  assert.ok(messages.includes("Round 1, Ann: hole 3 is a par 3, so it has no fairway."));
  assert.ok(messages.includes("Round 1: each hole's par should be 3, 4, 5 or 6."));
  assert.ok(messages.includes("Round 1, Ann: hole 18 has stats but no score."));
});

test("stats: a player adds their own putts later; only the organizer changes hole pars", () => {
  const d = statsDraft();
  d.scores[0].putts = null;
  const trip = checkDraft(d, TODAY).trip!;
  const putts = Array(18).fill(1);
  const mine = applyResultChanges(trip, { scores: [{ ...trip.scores[0], putts }], matches: [] }, { memberId: "a", organizer: false }, TODAY);
  assert.ok(mine.ok && mine.trip.scores[0].putts!.every((x) => x === 1));
  const pars = [{ round: 1, holePars: Array(18).fill(4) }];
  assert.equal(applyResultChanges(trip, { scores: [], matches: [], pars }, { memberId: "a", organizer: false }, TODAY).ok, false);
  const org = applyResultChanges(trip, { scores: [], matches: [], pars }, { memberId: "a", organizer: true }, TODAY);
  assert.ok(org.ok && org.trip.rounds[0].par === 72 && org.trip.rounds[0].holePars![2] === 4);
});
