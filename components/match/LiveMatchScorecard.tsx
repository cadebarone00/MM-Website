import type { ReactNode } from "react";
import type { RealMatch } from "@/lib/data/types";
import type { MatchProfileScorecard } from "@/lib/live/matchProfile";
import { getPlayerLastName } from "@/lib/data/players";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { liveLabel } from "@/components/leaderboard/matchUtils";

export function LiveMatchScorecard({ match, scorecard }: { match: RealMatch; scorecard: MatchProfileScorecard | null }) {
  if (!scorecard?.holes.length) return <p className="border-y border-ink-200 bg-cream-50 p-6 text-center text-sm text-ink-500">The scorecard will appear when the course setup is available.</p>;
  const holes = scorecard.holes;
  const sideScores = (players: string[]) => holes.map((hole) => {
    const scores = players.map((player) => hole.scores[player]);
    if (!scores.length || scores.some(score => score == null)) return null;
    const ordered = (scores as number[]).sort((a, b) => a - b);
    return match.format === "Play 4, Take 3" ? ordered.slice(0, 3).reduce((sum, score) => sum + score, 0) : ordered[0];
  });
  const maroon = sideScores(match.maroonPlayers);
  const white = sideScores(match.whitePlayers);
  let tally = 0;
  let stopped = false;
  const statuses: (number | null)[] = [];
  for (const [index, hole] of holes.entries()) {
    if (stopped || hole.number !== index + 1 || maroon[index] == null || white[index] == null) { stopped = true; statuses.push(null); continue; }
    tally += Math.sign(white[index]! - maroon[index]!);
    const status = tally;
    if (Math.abs(tally) > holes.length - hole.number) stopped = true;
    statuses.push(status);
  }
  const total = (values: (number | null)[]) => values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : "—";
  const row = (key: string, label: string, cells: ReactNode[], sum: ReactNode, tone = "bg-cream-100 text-maroon-700") => <tr key={key} className={tone}><th scope="row" className={`sticky left-0 z-20 h-12 w-[100px] min-w-[100px] border-r border-gold-600 px-1 text-center font-condensed text-[10px] uppercase ${tone}`}>{label}</th>{cells.map((cell, index) => <td key={index} className="relative isolate h-12 w-14 min-w-14 border-r border-gold-600 text-center text-xs">{cell ?? "—"}</td>)}<td className="h-12 w-14 min-w-14 border-l border-gold-600 text-center text-xs font-bold">{sum}</td></tr>;
  const scoresRow = (key: string, label: string, values: (number | null)[], team: "maroon" | "white") => row(key, label, values.map((score, index) => score == null ? "—" : <HoleMarkerForDiff key={index} diff={score - holes[index].par} size={24} tone={team === "maroon" ? "white" : "maroon"}>{score}</HoleMarkerForDiff>), total(values), team === "maroon" ? "bg-maroon-700 text-white" : "bg-white text-maroon-700");
  const players = (side: "maroon" | "white") => (side === "maroon" ? match.maroonPlayers : match.whitePlayers).map((player) => scoresRow(player, getPlayerLastName(player), holes.map((hole) => hole.scores[player] ?? null), side));
  const shared = match.format === "Foursome" || match.format === "Alt Shot";
  return <section>{scorecard.courseName && <p className="mb-3 font-condensed text-sm font-bold text-maroon-700">{scorecard.courseName}</p>}<div className="overflow-x-auto border-y border-ink-300" tabIndex={0} aria-label="Scroll match scorecard horizontally"><table className="w-max table-fixed border-collapse"><tbody>
    {row("holes", "Hole", holes.map((hole) => hole.number), "Tot")}
    {row("yards", "Yards", holes.map((hole) => hole.yards ?? null), total(holes.map((hole) => hole.yards ?? null)))}
    {row("par", "Par", holes.map((hole) => hole.par), total(holes.map((hole) => hole.par)))}
    {!shared && players("maroon")}
    {(shared || (match.format === "Fourball" || match.format === "Play 4, Take 3")) && scoresRow("maroon-side", shared ? "Maroon" : match.format === "Play 4, Take 3" ? "Best 3" : "Best Ball", maroon, "maroon")}
    {row("status", "Status", statuses.map((value, index) => value == null ? "—" : <span key={index} className={`flex h-12 items-center justify-center font-bold ${value > 0 ? "bg-maroon-700 text-white" : value < 0 ? "bg-white text-maroon-700" : ""}`} aria-label={`Hole ${index + 1}: ${value === 0 ? "All square" : `${value > 0 ? "Maroon" : "White"} ${Math.abs(value)} up`}`}>{value === 0 ? "AS" : `${Math.abs(value)} ${value > 0 ? "↑" : "↓"}`}</span>), match.status === "scheduled" ? "—" : liveLabel(match))}
    {(shared || match.format === "Fourball") && scoresRow("white-side", shared ? "White" : match.format === "Play 4, Take 3" ? "Best 3" : "Best Ball", white, "white")}
    {!shared && players("white")}
  </tbody></table></div></section>;
}
