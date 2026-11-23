import type { TvBoardData, TvMatchRow, TvPhase, TvPlayerRow } from "@/lib/platform/liveTv";
import type { TvKind } from "./livePreviews";

/**
 * Made-up players for the TV mode design page (/dev/tv). Nothing here is real. `phase` picks the stage (before it
 * starts, a round being played, between rounds, finished) and `kind` the event (its name and the line under it).
 */
const NAMES = ["Jackson Collins", "Jake Hill", "Cam Latto", "Cade Barone", "Ryan Ortiz", "Luke Sherrell", "Ben Alvarez", "Will Harper",
  "Tyler Nguyen", "Sam Price", "Drew Mitchell", "Nate Foster", "Chris Dawson", "Matt Kelly", "Owen Brooks", "Evan Reyes",
  "Grant Wallace", "Henry Cole", "Jordan Pike", "Mason Grey", "Logan Webb", "Aaron Shaw", "Blake Turner", "Cole Ramsey"];
const TOTALS = [-6, -4, -4, -3, -2, -2, -1, -1, 0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, null, null];
const THRU = ["F", "16", "F", "14", "F", "12", "F", "15", "F", "11", "13", "F", "17", "F", "10", "F", "9", "F", "F", "12", "F", "8", "", ""];

/** Each event kind's name and the line under it: a trip shows its location, a tournament or league its course. */
const EVENTS: Record<TvKind, { eventName: string; place: string }> = {
  trip: { eventName: "The Fall Classic", place: "Pinehurst, NC" },
  tournament: { eventName: "Member-Guest Invitational", place: "Pinehurst No. 2" },
  league: { eventName: "Thursday Night League", place: "Cedar Crest" },
};
const ROUND_LABEL: Record<TvPhase, string> = { before: "Round 1 · Oct 9", live: "Round 2", between: "Round 3 · Tomorrow", final: "After 3 rounds" };

function positions(totals: (number | null)[]): string[] {
  // The totals are already lowest first: a place is the first spot with that total, "T" when it's shared.
  return totals.map((t) => t == null ? "–" : (totals.filter((x) => x === t).length > 1 ? "T" : "") + String(totals.indexOf(t) + 1));
}

/** A tee time every 10 minutes from 8:00, two players (one match) a group. */
const teeTime = (group: number) => { const minutes = 8 * 60 + group * 10; return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`; };

export function sampleTvBoard(playerCount = 24, phase: TvPhase = "live", kind: TvKind = "trip"): TvBoardData {
  const n = Math.max(2, Math.min(playerCount, NAMES.length));
  const names = NAMES.slice(0, n);
  // Before: no scores, everyone with their tee time. Between and Final: every round finished (no one still out).
  const totals = phase === "before" ? names.map(() => null) : TOTALS.slice(0, n).map((t, i) => t ?? (phase === "live" ? null : 10 + i - 22));
  const pos = positions(totals);
  const individual: TvPlayerRow[] = names.map((name, i) => ({
    position: phase === "before" ? "" : pos[i], name, team: i % 2 ? "Rebels" : "Tigers", total: totals[i],
    today: totals[i] == null ? null : Math.round(totals[i]! / 2),
    thru: phase === "before" ? teeTime(Math.floor(i / 2)) : phase === "live" ? (THRU[i] || teeTime(10)) : "F",
  }));
  const pairs = Math.floor(n / 2);
  // During: finished, in progress, all square, and two that haven't teed off yet.
  const live: Pick<TvMatchRow, "middle" | "score" | "leader">[] = [
    { middle: "F", score: "3&2", leader: "left" }, { middle: "Thru 15", score: "1 UP", leader: "right" }, { middle: "Thru 12", score: "AS", leader: null },
    { middle: "F", score: "2&1", leader: "right" }, { middle: "Thru 14", score: "2 UP", leader: "left" }, { middle: "F", score: "AS", leader: null },
    { middle: "Thru 9", score: "3 UP", leader: "left" }, { middle: "Thru 6", score: "1 UP", leader: "right" }, { middle: "Thru 4", score: "AS", leader: null },
    { middle: "Thru 2", score: "1 UP", leader: "left" }, { middle: "10:20", score: "", leader: null }, { middle: "10:30", score: "", leader: null },
  ];
  // Between rounds / Final: every match decided (or halved).
  const done: Pick<TvMatchRow, "middle" | "score" | "leader">[] = [
    { middle: "F", score: "3&2", leader: "left" }, { middle: "F", score: "1 UP", leader: "right" }, { middle: "F", score: "AS", leader: null },
    { middle: "F", score: "2&1", leader: "right" }, { middle: "F", score: "4&3", leader: "left" }, { middle: "F", score: "2 UP", leader: "left" },
  ];
  const matches: TvMatchRow[] = Array.from({ length: pairs }, (_, i) => ({ number: i + 1, left: names[i * 2], right: names[i * 2 + 1],
    ...(phase === "before" ? { middle: teeTime(i), score: "", leader: null } : phase === "live" ? live[i % live.length] : done[i % done.length]) }));
  const points: Record<TvPhase, [number, number]> = { before: [0, 0], live: [6.5, 4.5], between: [8, 4], final: [13.5, 10.5] };
  return {
    ...EVENTS[kind], roundLabel: ROUND_LABEL[phase], phase,
    individual,
    match: { teams: [{ name: "Tigers", color: "#8a1c24", points: points[phase][0] }, { name: "Rebels", color: "#1f3a5f", points: points[phase][1] }], toWin: 12.5, matches },
  };
}
