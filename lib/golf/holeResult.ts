/**
 * THE hole-result classification, shared by scorecards (shapes), stats, skins labels and Highlights detection.
 * Pure. Everything is derived from strokes and the hole's real par — never a stored label, never a guessed par.
 *
 * Two views of the same score:
 *  - `result` names what happened, for highlights: an ace (1 stroke, whatever the par — even when par is unknown),
 *    albatross (exactly 3 under, not a 1), eagle (2 under), birdie, par, bogey, double bogey, triple or worse.
 *  - The scorecard view (shape, marker bucket, words) depends on strokes − par only, exactly as every scorecard has drawn
 *    it: 2+ under = double circle, 1 under = circle, par = none, 1 over = square, 2+ over = double square. So an ace on a
 *    par 3 keeps the eagle double circle. Without a par there is no scorecard view (drawn as a plain number).
 */

export type HoleResult = "ace" | "albatross" | "eagle" | "birdie" | "par" | "bogey" | "double-bogey" | "triple-or-worse";
/** The five scorecard buckets (lib/data `HoleMarker`): shapes, the "eagles / birdies / pars / bogeys / doubles" mix. */
export type HoleMarker = "eagle" | "birdie" | "par" | "bogey" | "double-or-worse";
export interface HoleShape { outline: "circle" | "square" | "none"; rings: 0 | 1 | 2 }

export interface HoleClassification {
  /** null when par is unknown and it isn't an ace, or when it's 4+ under without an ace. */
  result: HoleResult | null;
  /** strokes − par; null when par is unknown. */
  toPar: number | null;
  /** Scorecard bucket and shape; null when par is unknown (draw the plain number). */
  marker: HoleMarker | null;
  shape: HoleShape | null;
}

/** A usable hole par: a whole number 2–7 (the range the course tables accept). */
export const isKnownPar = (par: number | null | undefined): par is number => Number.isInteger(par) && (par as number) >= 2 && (par as number) <= 7;

export function classifyHole(strokes: number, par: number | null | undefined): HoleClassification {
  if (!isKnownPar(par)) return { result: strokes === 1 ? "ace" : null, toPar: null, marker: null, shape: null };
  const toPar = strokes - par;
  return { result: resultFor(strokes, toPar), toPar, marker: markerForToPar(toPar), shape: shapeForToPar(toPar) };
}

/**
 * What happened on the hole. A 1 is always an ace, whatever the par. Albatross is exactly 3 under and not a 1 (a 2 on a
 * par 5, a 3 on a par 6). 4+ under without an ace (a 2 on a par 6) has no name here: null, so nothing fires.
 */
export function resultFor(strokes: number, toPar: number): HoleResult | null {
  if (strokes === 1) return "ace";
  if (toPar <= -4) return null;
  if (toPar === -3) return "albatross";
  if (toPar === -2) return "eagle";
  if (toPar === -1) return "birdie";
  if (toPar === 0) return "par";
  if (toPar === 1) return "bogey";
  if (toPar === 2) return "double-bogey";
  return "triple-or-worse";
}

/** Scorecard bucket from strokes − par (2+ under counts as "eagle", 2+ over as "double-or-worse"). */
export function markerForToPar(toPar: number): HoleMarker {
  if (toPar <= -2) return "eagle";
  if (toPar === -1) return "birdie";
  if (toPar === 0) return "par";
  if (toPar === 1) return "bogey";
  return "double-or-worse";
}

export const MARKER_SHAPES: Record<HoleMarker, HoleShape> = {
  eagle: { outline: "circle", rings: 2 },
  birdie: { outline: "circle", rings: 1 },
  par: { outline: "none", rings: 0 },
  bogey: { outline: "square", rings: 1 },
  "double-or-worse": { outline: "square", rings: 2 },
};
export const shapeForToPar = (toPar: number): HoleShape => MARKER_SHAPES[markerForToPar(toPar)];

/** The scorecard's words for a score against par, as the skins board says it ("Albatross" for 3 under, ace or not). */
export function scoreNameForToPar(toPar: number): string {
  if (toPar === 0) return "Par";
  if (toPar === -1) return "Birdie";
  if (toPar === -2) return "Eagle";
  if (toPar === -3) return "Albatross";
  if (toPar === 1) return "Bogey";
  if (toPar === 2) return "Double bogey";
  if (toPar === 3) return "Triple bogey";
  return `${Math.abs(toPar)} ${toPar < 0 ? "under" : "over"} par`;
}

/** Stat helpers (Golf → Stats): "birdies" there means birdie or better. */
export const isBirdieOrBetter = (toPar: number) => toPar < 0;
export const isParOrBetter = (toPar: number) => toPar <= 0;
export const isBogeyOrWorse = (toPar: number) => toPar > 0;
