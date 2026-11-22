import { holeRange, type PersonalRoundSetup } from "./personalRound.ts";
import type { ScoredCard } from "./playerRounds.ts";
import type { SharedRound } from "./sharedRoundsServer.ts";

/**
 * Play a round with one scorekeeper (project_specs.md, 2026-11-21): the cards the host's Submit & Save saves for every
 * joined player, and the rows the live card shows. Pure: used by the server (saving) and the phones (showing).
 */

/** One player's strokes by hole index (18 long, null = not entered). */
export function playerStrokes(round: Pick<SharedRound, "holes">, profileId: string): (number | null)[] {
  const row: (number | null)[] = Array.from({ length: 18 }, () => null);
  for (const h of round.holes) if (h.profileId === profileId) row[h.hole - 1] = h.strokes;
  return row;
}

/** One guest's strokes by hole index (18 long, null = not entered). */
export function guestStrokes(round: Pick<SharedRound, "guestHoles">, guestId: string): (number | null)[] {
  const row: (number | null)[] = Array.from({ length: 18 }, () => null);
  for (const h of round.guestHoles ?? []) if (h.guestId === guestId) row[h.hole - 1] = h.strokes;
  return row;
}

/** What a joined player's saved round uses: the host's setup, with stats only when the host let players keep their own. */
export const memberSetup = (setup: PersonalRoundSetup): PersonalRoundSetup => ({ ...setup, stats: setup.playerStats === true });

/** A joined player's card from the round, or null when the host hasn't scored every hole played. */
export function memberCard(round: Pick<SharedRound, "holes" | "setup">, profileId: string): ScoredCard | null {
  const [start, end] = holeRange(round.setup.holes);
  const par = round.setup.course.par;
  const mine = round.holes.filter((h) => h.profileId === profileId);
  const at = (i: number) => mine.find((h) => h.hole === i + 1);
  const strokes = par.map((p, i) => at(i)?.strokes ?? (i >= start && i < end ? null : p));
  if (strokes.some((s) => s == null)) return null;
  const stats = round.setup.playerStats === true;
  return {
    strokes: strokes as number[],
    putts: par.map((_, i) => (stats ? at(i)?.putts ?? null : null)),
    fairways: par.map((_, i) => (stats ? at(i)?.fairway ?? null : null)),
    greens: par.map((_, i) => (stats ? at(i)?.green ?? null : null)),
  };
}
