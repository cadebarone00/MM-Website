import type { TvBoardData, TvMatchRow, TvPlayerRow } from "@/lib/platform/liveTv";

/** Made-up players for the TV mode design page (/dev/tv). Nothing here is real. */
const NAMES = ["Jackson Collins", "Jake Hill", "Cam Latto", "Cade Barone", "Ryan Ortiz", "Luke Sherrell", "Ben Alvarez", "Will Harper",
  "Tyler Nguyen", "Sam Price", "Drew Mitchell", "Nate Foster", "Chris Dawson", "Matt Kelly", "Owen Brooks", "Evan Reyes",
  "Grant Wallace", "Henry Cole", "Jordan Pike", "Mason Grey", "Logan Webb", "Aaron Shaw", "Blake Turner", "Cole Ramsey"];
const TOTALS = [-6, -4, -4, -3, -2, -2, -1, -1, 0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, null, null];
const THRU = ["F", "16", "F", "14", "F", "12", "F", "15", "F", "11", "13", "F", "17", "F", "10", "F", "9", "F", "F", "12", "F", "8", "", ""];

function positions(totals: (number | null)[]): string[] {
  // The totals are already lowest first: a place is the first spot with that total, "T" when it's shared.
  return totals.map((t) => t == null ? "–" : (totals.filter((x) => x === t).length > 1 ? "T" : "") + String(totals.indexOf(t) + 1));
}

export function sampleTvBoard(playerCount = 24): TvBoardData {
  const n = Math.max(2, Math.min(playerCount, NAMES.length));
  const totals = TOTALS.slice(0, n);
  const pos = positions(totals);
  const individual: TvPlayerRow[] = NAMES.slice(0, n).map((name, i) => ({
    position: pos[i], name, team: i % 2 ? "Rebels" : "Tigers", total: totals[i], today: totals[i] == null ? null : Math.round(totals[i]! / 2), thru: THRU[i] ? THRU[i] : "8:40",
  }));
  const pairs = Math.floor(n / 2);
  // Finished, in progress, all square, and two that haven't teed off yet.
  const states: Pick<TvMatchRow, "middle" | "score" | "leader">[] = [
    { middle: "F", score: "3&2", leader: "left" }, { middle: "Thru 15", score: "1 UP", leader: "right" }, { middle: "Thru 12", score: "AS", leader: null },
    { middle: "F", score: "2&1", leader: "right" }, { middle: "Thru 14", score: "2 UP", leader: "left" }, { middle: "F", score: "AS", leader: null },
    { middle: "Thru 9", score: "3 UP", leader: "left" }, { middle: "Thru 6", score: "1 UP", leader: "right" }, { middle: "Thru 4", score: "AS", leader: null },
    { middle: "Thru 2", score: "1 UP", leader: "left" }, { middle: "10:20", score: "", leader: null }, { middle: "10:30", score: "", leader: null },
  ];
  const matches: TvMatchRow[] = Array.from({ length: pairs }, (_, i) => ({ number: i + 1, left: NAMES[i * 2], right: NAMES[i * 2 + 1], ...states[i % states.length] }));
  return {
    eventName: "The Fall Classic", roundLabel: "Round 2 · Pinehurst No. 2",
    individual,
    match: { teams: [{ name: "Tigers", color: "#8a1c24", points: 6.5 }, { name: "Rebels", color: "#1f3a5f", points: 4.5 }], toWin: 12.5, matches },
  };
}
