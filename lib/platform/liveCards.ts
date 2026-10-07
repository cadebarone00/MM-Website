import type { HolePenalties, ScoredCard, ShotResult } from "./playerRounds";

/**
 * A player's card while the round is being played (Player & Attest add-on). The player writes their own strokes and
 * stats; their attester's phone writes `attestStrokes`. On Submit & Save it becomes the player's `PlayerRound`.
 */
export interface LiveCardHole { number: number; strokes: number | null; putts: number | null; fairway: ShotResult | null; green: ShotResult | null; penalties: HolePenalties; attestStrokes: number | null }
export interface LiveCard { groupId: string; profileId: string; holes: LiveCardHole[] }
/** The Scoring sheet's arrays, one entry per hole. */
export interface SheetCard { strokes: (number | null)[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties: HolePenalties[]; attestStrokes: (number | null)[] }

export function liveCardFromSheet(groupId: string, profileId: string, sheet: SheetCard): LiveCard {
  return { groupId, profileId, holes: sheet.strokes.map((strokes, i) => ({
    number: i + 1, strokes, putts: sheet.putts[i] ?? null, fairway: sheet.fairways[i] ?? null, green: sheet.greens[i] ?? null,
    penalties: sheet.penalties[i] ?? { fairway: false, green: false }, attestStrokes: sheet.attestStrokes[i] ?? null,
  })) };
}

/** Holes where the player and the attester don't agree yet, including a hole only one of them has entered. */
export const mismatchedHoles = (card: LiveCard) => card.holes.filter((h) => h.strokes !== h.attestStrokes).map((h) => h.number);

/** Every hole has strokes, putts and a green; a fairway too, except on par 3s. */
export const cardComplete = (card: LiveCard, par: number[]) => card.holes.every((h) =>
  h.strokes !== null && h.putts !== null && h.green !== null && (par[h.number - 1] === 3 || h.fairway !== null));

/** Submit & Save lights up: complete, and (unless solo) the attester agrees on every hole. */
export const readyToSubmit = (card: LiveCard, par: number[], attested: boolean) => cardComplete(card, par) && (!attested || mismatchedHoles(card).length === 0);

/** The saved card: the player's own strokes, or `strokes` chosen by the organizer (push-through). */
export function scoredCardFrom(card: LiveCard, strokes?: number[]): ScoredCard {
  return {
    strokes: card.holes.map((h, i) => {
      const value = strokes?.[i] ?? h.strokes;
      if (value === null) throw new Error(`Hole ${h.number} has no score.`);
      return value;
    }),
    putts: card.holes.map((h) => h.putts), fairways: card.holes.map((h) => h.fairway), greens: card.holes.map((h) => h.green),
    penalties: card.holes.map((h) => h.penalties),
  };
}

/** The Scoring sheet's state → its live card. Untouched holes count as par, exactly as the sheet shows and submits them. */
export function sheetCardFromScoring({ holes, par, ...rest }: Omit<SheetCard, "strokes"> & { holes: (number | null)[]; par?: number[] }): SheetCard {
  return { ...rest, strokes: holes.map((h, i) => h ?? par?.[i] ?? null) };
}
