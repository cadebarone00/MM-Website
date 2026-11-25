import { matchScoring, matchStatus, normalizeCompetitor, type GolfMatchCompetitor, type GolfMatchGolfer, type GolfMatchPreview, type GolfMatchStanding } from "./golfTripPreviewFixture";

/**
 * Small Golf tab rules shared by the website (components/platform/GolfTripMatch.tsx) and the app (project_specs.md
 * Golf Trips part 2d): score labels, the tee sheet grouping and the round's day label.
 */

/** "3" → "+3", "0" / "E" → "E", "-2" stays; anything else (blank, "—", "12 PTS") as it is. */
export function parLabel(score: string): string {
  const value = score.trim() === "E" ? 0 : Number(score);
  if (!score.trim() || !Number.isFinite(value)) return score;
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

/** Which color a to-par score gets: even (gold), under par (red), over par (plain). */
export function parColor(score: string): "even" | "under" | "over" | undefined {
  if (score === "E") return "even";
  if (score.startsWith("-")) return "under";
  if (score.startsWith("+")) return "over";
  return undefined;
}

/** "7:40 AM" as minutes after midnight, for sorting; anything else sorts last. */
export function teeMinutes(time: string): number {
  const found = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!found) return Number.MAX_SAFE_INTEGER;
  return (Number(found[1]) % 12 + (found[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(found[2]);
}

/** The tee sheet: each tee time (earliest first, "Tee time TBD" last) with its players; players sitting out are left off. */
export function teeSheet(match: GolfMatchPreview, sittingOut?: ReadonlySet<string>): [string, GolfMatchGolfer[]][] {
  const groups = new Map<string, GolfMatchGolfer[]>();
  for (const { golfer } of match.leaderboard) {
    if (sittingOut?.has(golfer.name)) continue;
    const time = golfer.teeTime || "Tee time TBD";
    groups.set(time, [...(groups.get(time) ?? []), golfer]);
  }
  return [...groups].sort(([a], [b]) => teeMinutes(a) - teeMinutes(b));
}

/** "2026-04-22" → "Wed, Apr 22". */
export function roundDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A "Thru 12" / "F" as holes done (F = 18; anything else = 0). */
export function holesDone(thru: string | undefined): number {
  return thru === "F" ? 18 : Number(/^Thru (\d+)$/.exec(thru ?? "")?.[1]) || 0;
}

/**
 * A match's status for its middle: the last hole every player in it has finished (so THRU only moves once both sides
 * have the hole), the left side's tee time before it starts, THRU once `started` even with no hole done.
 */
export function pairingStatus(left: GolfMatchCompetitor, right: GolfMatchCompetitor | undefined, standing: GolfMatchStanding, result: string | undefined, started: boolean) {
  const players = [left, right].flatMap(side => !side ? [] : side.thru ? [side.thru] : side.golfers.map(golfer => golfer.thru));
  const holes = players.length ? Math.min(...players.map(holesDone)) : 0;
  return matchStatus({ thru: holes >= 18 ? "F" : holes ? `Thru ${holes}` : "", teeTime: left.teeTime || left.golfers[0]?.teeTime, standing, result, started });
}

/**
 * The match score a side shows: the leader's "2 UP" while playing or its result ("4&3", "1 UP") once over; "AS" on both
 * sides when neither leads. Nothing before the match starts.
 */
export function sideScore(status: ReturnType<typeof matchStatus>, standing: GolfMatchStanding, side: "left" | "right"): string {
  if (status.kind === "tee" || (status.kind === "thru" && status.holes === 0)) return "";
  if (status.kind === "final") return status.text === "AS" ? "AS" : standing?.leader === side ? status.text : "";
  return standing?.leader === null ? "AS" : standing?.leader === side ? `${standing.up} UP` : "";
}

/** Each player's match points across the matches, best first: the data's points, else a finished match = 1 to each winner, ½ each when halved. */
export function playerPoints(match: GolfMatchPreview): { name: string; side: "left" | "right"; points: number }[] {
  const totals = new Map<string, { name: string; side: "left" | "right"; points: number }>();
  const net = matchScoring(match) === "Net";
  for (const pairing of match.matches) {
    const sides = [normalizeCompetitor(pairing.left), pairing.right ? normalizeCompetitor(pairing.right) : null] as const;
    const standing = net ? pairing.net : pairing.gross;
    const status = matchStatus({ thru: sides[0].thru ?? sides[0].golfers[0]?.thru, standing, result: pairing.result });
    sides.forEach((side, i) => {
      if (!side) return;
      const key = i ? "right" : "left";
      const earned = side.points ?? side.golfers[0]?.points ?? (status.kind !== "final" ? 0
        : standing?.leader == null ? 0.5 : standing.leader === key ? 1 : 0);
      for (const golfer of side.golfers) {
        const row = totals.get(golfer.name) ?? { name: golfer.name, side: key, points: 0 };
        row.points += earned;
        totals.set(golfer.name, row);
      }
    });
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
