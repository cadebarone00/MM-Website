import type { GolfLeaderboardEntry } from "./golfTripPreviewFixture";

/** Last name for sorting: the last word of the first golfer's name ("Nate Wojciechowski" → "Wojciechowski"). */
export function lastName(name: string): string {
  const first = name.split("&")[0].trim();
  const words = first.split(/\s+/);
  return words[words.length - 1] ?? first;
}

const byLastName = (a: GolfLeaderboardEntry, b: GolfLeaderboardEntry) =>
  lastName(a.golfer.name).localeCompare(lastName(b.golfer.name), "en", { sensitivity: "base", numeric: true })
  || a.golfer.name.localeCompare(b.golfer.name, "en", { sensitivity: "base", numeric: true });

/** A to-par label ("-3", "E", "+2") or points as a number; null when there's no score yet ("—", blank). */
function scoreOf(row: GolfLeaderboardEntry, net: boolean, stableford: boolean): number | null {
  if (stableford && row.pointsTotal !== undefined) return row.pointsTotal;
  const label = (net ? row.netTotal : row.total).replace(/\s*PTS/i, "").trim();
  if (label === "E") return 0;
  if (!/^[+-]?\d+(\.\d+)?$/.test(label)) return null;
  return Number(label);
}

/**
 * Leaderboard order, always: best score first, worst last (lowest to par for stroke play, most points for Stableford),
 * with "T" for ties; ties and anyone without a score yet fall back to last name A–Z, and unscored players go at the
 * bottom with "—" for a place. Before the tournament (nobody has a score) that makes it simply alphabetical by last name.
 */
export function rankLeaderboard(rows: GolfLeaderboardEntry[], { net = false, stableford = false } = {}): GolfLeaderboardEntry[] {
  const scored = rows.map((row) => ({ row, score: scoreOf(row, net, stableford) }));
  const sorted = [...scored].sort((a, b) => {
    if (a.score === null || b.score === null) return a.score === b.score ? byLastName(a.row, b.row) : a.score === null ? 1 : -1;
    return (stableford ? b.score - a.score : a.score - b.score) || byLastName(a.row, b.row);
  });
  return sorted.map(({ row, score }) => {
    if (score === null) return { ...row, position: "—" };
    const place = sorted.findIndex((other) => other.score === score) + 1;
    const tied = sorted.filter((other) => other.score === score).length > 1;
    return { ...row, position: `${tied ? "T" : ""}${place}` };
  });
}
