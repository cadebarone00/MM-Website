import type { HoleScoreEntry, TripRoundScoring } from "../../platform/tripScoring.ts";

/**
 * Test / simulator data (not a test file itself): builds a real TripRoundScoring the way scoring stores it — each golfer
 * enters their own card, their attester enters it too — from a compact description. Repeatable: no randomness, fixed times.
 */

/** A par-72 layout: four par 3s, four par 5s. */
export const PARS_72 = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5];

export interface FixturePlayer { id: string; name: string; attester: string | null }
export interface FixtureOptions {
  roundId?: string;
  roundNumber?: number;
  /** Holes the attester hasn't entered yet, per golfer. */
  unattested?: Record<string, number[]>;
  /** Attester entries that disagree with the golfer's own, per golfer: hole → attester's strokes. */
  disagree?: Record<string, Record<number, number>>;
  /** Entry order: by hole (default), reversed, or a given hole order (out-of-order syncing). */
  order?: "forward" | "reverse" | number[];
  /** Extra copies of every entry with a higher version and the same strokes (a replayed / re-synced card). */
  replay?: boolean;
  /** Corrections: later versions of the golfer's AND attester's entries with new strokes, per golfer: hole → strokes. */
  corrections?: Record<string, Record<number, number>>;
  /** A second round of corrections, newer still (e.g. restoring the original score): per golfer, hole → strokes. */
  laterCorrections?: Record<string, Record<number, number>>;
}

const START = Date.UTC(2026, 9, 16, 21, 0); // 2:00 PM PDT

/** scores: per golfer, 18 strokes (null = hole not played / not entered). */
export function buildScoring(players: FixturePlayer[], scores: Record<string, (number | null)[]>, options: FixtureOptions = {}): TripRoundScoring {
  const holeOrder = options.order === "reverse" ? Array.from({ length: 18 }, (_, i) => 18 - i) : Array.isArray(options.order) ? options.order : Array.from({ length: 18 }, (_, i) => i + 1);
  const at = (step: number) => new Date(START + step * 7 * 60000).toISOString();
  const entries: HoleScoreEntry[] = [];
  const entry = (scored: string, by: string, hole: number, strokes: number | null, version: number, step: number): HoleScoreEntry => ({
    scoredProfileId: scored, enteredByProfileId: by, hole, strokes, putts: null, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: at(step), version,
  });
  holeOrder.forEach((hole, step) => {
    for (const p of players) {
      const strokes = scores[p.id]?.[hole - 1] ?? null;
      if (strokes === null) continue;
      entries.push(entry(p.id, p.id, hole, strokes, 1, step));
      if (p.attester && !options.unattested?.[p.id]?.includes(hole)) entries.push(entry(p.id, p.attester, hole, options.disagree?.[p.id]?.[hole] ?? strokes, 1, step));
    }
  });
  if (options.replay) for (const e of [...entries]) entries.push({ ...e, version: e.version + 1, clientUpdatedAt: new Date(Date.parse(e.clientUpdatedAt) + 60000).toISOString() });
  const correct = (all: Record<string, Record<number, number>> | undefined, version: number, offset: number) => {
    for (const [id, holes] of Object.entries(all ?? {})) {
      const player = players.find((p) => p.id === id)!;
      for (const [hole, strokes] of Object.entries(holes)) {
        const step = offset + Number(hole);
        entries.push(entry(id, id, Number(hole), strokes, version, step));
        if (player.attester) entries.push(entry(id, player.attester, Number(hole), strokes, version, step));
      }
    }
  };
  correct(options.corrections, 9, 19);
  correct(options.laterCorrections, 10, 40);
  return {
    roundId: options.roundId ?? "round-2", roundNumber: options.roundNumber ?? 2,
    groups: [{ id: "group-1", groupNumber: 1, lockedAt: null, players: players.map((p, i) => ({ profileId: p.id, displayName: p.name, playOrder: i + 1, side: null, attesterProfileId: p.attester, submittedAt: null })) }],
    entries,
  };
}

/** A card relative to par: 0 = par, -1 = birdie, -2 = eagle, "ace" = hole-in-one; null = not entered. */
export function card(pars: number[], toPar: Record<number, number | "ace">, through = 18): (number | null)[] {
  return pars.map((par, i) => (i + 1 > through ? null : toPar[i + 1] === "ace" ? 1 : par + ((toPar[i + 1] as number | undefined) ?? 0)));
}
