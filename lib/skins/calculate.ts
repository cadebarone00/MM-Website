import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import { isIndividualScoreFormat } from "@/lib/handicap/archiveIndex";

export type SkinsRound = {
  player: string;
  round: number;
  course: string;
  format: string | null;
  holes: { hole: number; score: number; par?: number }[];
};

export type SkinOpponent = { player: string; score: number; par: number | null };
export type SkinWin = { player: string; round: number; course: string; hole: number; score: number; par: number | null; opponents: SkinOpponent[] };

/** Gross skins: one sole low scorer per hole, across the session's field. No carryovers. */
export function calculateSkinsResults(rounds: SkinsRound[]): { totals: Record<string, number>; wins: SkinWin[] } {
  const totals: Record<string, number> = {};
  const wins: SkinWin[] = [];
  const sessions = new Map<string, SkinsRound[]>();
  for (const round of rounds) {
    totals[round.player] ??= 0;
    if (!isIndividualScoreFormat(round.format)) continue;
    const key = JSON.stringify([round.round, canonicalCourseName(round.course).toLowerCase()]);
    const field = sessions.get(key) ?? [];
    field.push(round);
    sessions.set(key, field);
  }
  for (const field of sessions.values()) {
    // Duplicate player cards are ambiguous; never award a skin from them.
    if (field.length < 2 || new Set(field.map((r) => r.player)).size !== field.length) continue;
    for (let hole = 1; hole <= 18; hole++) {
      const scores = field.map((round) => {
        const entries = round.holes.filter((entry) => entry.hole === hole);
        return entries.length === 1 ? entries[0].score : NaN;
      });
      // A missing, picked-up or invalid score cannot establish a sole winner.
      if (scores.some((score) => !Number.isInteger(score) || score <= 0)) continue;
      const low = Math.min(...scores);
      if (scores.filter((score) => score === low).length !== 1) continue;
      const winner = field[scores.indexOf(low)];
      const par = winner.holes.find((entry) => entry.hole === hole)?.par;
      totals[winner.player]++;
      wins.push({ player: winner.player, round: winner.round, course: canonicalCourseName(winner.course), hole, score: low,
        par: par != null && Number.isInteger(par) && par > 0 ? par : null,
        opponents: field.filter((entry) => entry.player !== winner.player).map((entry) => {
          const score = entry.holes.find((item) => item.hole === hole)!;
          return { player: entry.player, score: score.score,
            par: score.par != null && Number.isInteger(score.par) && score.par > 0 ? score.par : null };
        }),
      });
    }
  }
  return { totals, wins: wins.sort((a, b) => a.round - b.round || a.course.localeCompare(b.course) || a.hole - b.hole) };
}

export function calculateSkins(rounds: SkinsRound[]): Record<string, number> {
  return calculateSkinsResults(rounds).totals;
}
