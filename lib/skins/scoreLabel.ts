import { scoreNameForToPar } from "../golf/holeResult";

/** The skins board's words for a score, from the shared hole classifier (lib/golf/holeResult.ts). */
export function skinsScoreLabel(score: number, par: number | null): string {
  if (par == null) return "Par unavailable";
  return scoreNameForToPar(score - par);
}
