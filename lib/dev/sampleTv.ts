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
  const statuses: Pick<TvMatchRow, "status" | "leader" | "final">[] = [
    { status: "3&2", leader: "left", final: true }, { status: "1 UP thru 15", leader: "right", final: false }, { status: "AS thru 12", leader: null, final: false },
    { status: "2&1", leader: "right", final: true }, { status: "2 UP thru 14", leader: "left", final: false }, { status: "Halved", leader: null, final: true },
  ];
  const matches: TvMatchRow[] = Array.from({ length: pairs }, (_, i) => ({ label: `Match ${i + 1}`, left: NAMES[i * 2], right: NAMES[i * 2 + 1], ...statuses[i % statuses.length] }));
  return {
    eventName: "The Fall Classic", roundLabel: "Round 2 · Pinehurst No. 2",
    individual,
    match: { teams: [{ name: "Tigers", color: "#8a1c24", points: 6.5 }, { name: "Rebels", color: "#1f3a5f", points: 4.5 }], toWin: 12.5, matches },
  };
}
