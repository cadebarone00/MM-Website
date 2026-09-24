import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import { isIndividualScoreFormat } from "@/lib/handicap/archiveIndex";

export type SkinsRound = {
  player: string;
  round: number;
  course: string;
  format: string | null;
  holes: { hole: number; score: number }[];
};

/** Gross skins: one sole low scorer per hole, across the session's field. No carryovers. */
export function calculateSkins(rounds: SkinsRound[]): Record<string, number> {
  const totals: Record<string, number> = {};
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
      totals[field[scores.indexOf(low)].player]++;
    }
  }
  return totals;
}
