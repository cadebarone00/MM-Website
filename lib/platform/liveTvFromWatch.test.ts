import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, parseToPar, toWinFrom, tvFromLeague, tvFromPreview, tvFromTournament } from "./liveTvFromWatch.ts";
import { tripLivePlace } from "./watchView.ts";
import type { CodeTournament } from "./codeTournaments.ts";
import type { League } from "./leagues.ts";
import type { GolfMatchPreview } from "./golfTripPreviewFixture.ts";

const PAR = Array(18).fill(4);
const setup = { course: { ref: "c", name: "Pine Valley", place: "Dallas, TX", par: PAR, strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1) }, tee: null };
const card = (profileId: string, round: number, strokes: number[]) => strokes.map((s, i) => ({ profileId, round, hole: i + 1, strokes: s }));
function tournament(holes: CodeTournament["holes"], status: "live" | "ended" = "live"): CodeTournament {
  return { id: "t", code: "K7Q4MZ", name: "Member-Guest", organizer: "a", organizerPlays: true, scoring: "Gross", status, createdAt: "",
    rounds: [{ number: 1, setup, date: "2026-11-01" }, { number: 2, setup, date: "2026-11-02" }],
    players: [{ profileId: "a", name: "Cam Latto", username: null, handicap: 0 }, { profileId: "b", name: "Cade Barone", username: null, handicap: 0 }],
    holes, cards: [] };
}

test("small readers: to par text, day names and points to win", () => {
  assert.deepEqual(["E", "-3", "+2", "—", ""].map(parseToPar), [0, -3, 2, null, null]);
  assert.deepEqual([dayLabel("2026-11-01", "2026-11-01"), dayLabel("2026-11-02", "2026-11-01"), dayLabel("2026-10-09", "2026-11-01"), dayLabel(null, "2026-11-01")],
    ["Today", "Tomorrow", "Oct 9", ""]);
  assert.deepEqual([toWinFrom(24), toWinFrom(11), toWinFrom(0)], [12.5, 6, null]);
});

test("tournament: before it starts, no places and Round 1 with its date", () => {
  const tv = tvFromTournament(tournament([]), "2026-10-30");
  assert.equal(tv.phase, "before");
  assert.equal(tv.roundLabel, "Round 1 · Nov 1");
  assert.equal(tv.place, "Pine Valley");
  assert.deepEqual(tv.individual!.map((r) => r.position), ["", ""]);
  assert.equal(tv.match, null, "stroke play has no match board");
});

test("tournament: during a round, best total first with places", () => {
  const tv = tvFromTournament(tournament([...card("a", 1, [5, 5]), ...card("b", 1, [3, 4, 4])]), "2026-11-01");
  assert.equal(tv.phase, "live");
  assert.equal(tv.roundLabel, "Round 1");
  assert.deepEqual(tv.individual!.map((r) => [r.position, r.name, r.total, r.thru]), [["1", "Cade Barone", -1, "3"], ["2", "Cam Latto", 2, "2"]]);
});

test("tournament: between rounds, then completed", () => {
  const done = [...card("a", 1, PAR), ...card("b", 1, PAR.map((p, i) => i === 0 ? 3 : p))];
  const between = tvFromTournament(tournament(done), "2026-11-01");
  assert.equal(between.phase, "between");
  assert.equal(between.roundLabel, "Round 2 · Tomorrow");
  assert.deepEqual(between.individual!.map((r) => [r.position, r.thru]), [["1", "F"], ["2", "F"]]);
  const final = tvFromTournament(tournament(done, "ended"), "2026-11-05");
  assert.equal(final.phase, "final");
  assert.equal(final.roundLabel, "After 2 rounds");
});

function league(cards: Record<string, number[]>, status: "live" | "ended" = "live"): League {
  const ids = Object.keys(cards);
  return { id: "l1", code: "ABC123", name: "Thursday Night", organizer: ids[0], date: "2026-11-12", status,
    course: { name: "Cedar Crest", place: null, par: PAR, strokeIndex: null, tee: null }, scoring: "Gross",
    players: ids.map((id) => ({ profileId: id, name: id.toUpperCase(), handicap: null })),
    groups: [{ number: 1, time: "08:40", hole: 1, scorer: ids[0], players: ids }],
    skins: { on: false, net: false, carryover: false }, pairs: { on: false, format: "bestball", net: false, segments: 18, rule: "random", locked: false, teams: [] },
    holes: ids.flatMap((id) => cards[id].map((strokes, h) => ({ profileId: id, hole: h + 1, strokes }))) };
}

test("league: tee times before, live during, final when everyone's done (never between rounds)", () => {
  const before = tvFromLeague(league({ a: [], b: [] }), "2026-11-11");
  assert.deepEqual([before.phase, before.roundLabel, before.place, before.individual![0].thru], ["before", "Tomorrow", "Cedar Crest", "8:40"]);
  const live = tvFromLeague(league({ a: [3, 4], b: [] }), "2026-11-12");
  assert.deepEqual([live.phase, live.roundLabel, live.individual![0].total, live.individual![0].thru], ["live", "Today", -1, "2"]);
  assert.equal(tvFromLeague(league({ a: PAR, b: PAR }), "2026-11-12").phase, "final");
  assert.equal(tvFromLeague(league({ a: [], b: [] }, "ended"), "2026-11-12").phase, "final");
});

test("matches: names on their sides, Thru / F / tee time in the middle, the leader's color glows; team points to win", () => {
  const golfer = (name: string, thru: string, teeTime = "") => ({ name, hcp: 0, thru, score: "", teeTime, course: "" });
  const p = { round: 1, roundCount: 1, course: "Pinehurst No. 2", roundDate: "", format: "Singles", handicap: false, scoring: "Gross", par: PAR,
    sides: [{ name: "Tigers" }, { name: "Rebels" }], roundScoring: [{ round: 1, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: 3 }],
    leaderboard: [],
    matches: [
      { left: golfer("Cam", "Thru 12"), right: golfer("Cade", "Thru 12"), gross: { leader: "left", up: 2 }, net: null },
      { left: golfer("Jake", "F"), right: golfer("Ryan", "F"), gross: { leader: "right", up: 1 }, net: null },
      { left: golfer("Luke", "", "10:20 AM"), right: golfer("Ben", "", "10:20 AM"), gross: null, net: null },
    ] } as unknown as GolfMatchPreview;
  const tv = tvFromPreview(p, { name: "Fall Classic", place: "Pinehurst, NC", rounds: [{ number: 1, date: null }], ended: false, colors: ["#111111"] }, "2026-11-01");
  assert.deepEqual(tv.match!.matches.map((m) => [m.left, m.right, m.middle, m.score, m.leader]), [
    ["Cam", "Cade", "Thru 12", "2 UP", "left"], ["Jake", "Ryan", "F", "1 UP", "right"], ["Luke", "Ben", "10:20", "", null]]);
  assert.deepEqual(tv.match!.teams.map((t) => [t.name, t.color, t.points]), [["Tigers", "#111111", 0], ["Rebels", "#1f3a5f", 1]]);
  assert.equal(tv.match!.toWin, 2);
});

test("a trip's location reaches watchers only when the trip is Public", () => {
  assert.equal(tripLivePlace({ destination: " Pinehurst, NC ", live_visibility: "public" }), "Pinehurst, NC");
  assert.equal(tripLivePlace({ destination: "Pinehurst, NC", live_visibility: "link" }), null);
  assert.equal(tripLivePlace({ destination: "", live_visibility: "public" }), null);
});
