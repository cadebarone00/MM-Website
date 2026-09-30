/**
 * Match formats the platform can run. Formats are business logic, so they
 * live here in code; a tournament only chooses which ones it uses
 * (THE_MAROON_PRODUCT_SPEC.md §5). Adding a format = one entry here plus its
 * scoring rule in the live engine.
 *
 * Keys match the existing live engine's MatchFormat values exactly, so the
 * same strings work in live_match_boxes / live_round_state today.
 */
export interface FormatDefinition {
  key: FormatKey;
  label: string;
  description: string;
  /** Golfers on each side of one match (1 = singles, 2 = pairs). */
  playersPerSide: number;
  /** False for team-ball formats: the round never counts toward a player's own stats or handicap. */
  countsIndividualStats: boolean;
}

export type FormatKey = "Singles" | "Fourball" | "Foursome";

/** Golfers who go off one tee time together. */
export const GROUP_SIZE = 4;

export const FORMATS: Record<FormatKey, FormatDefinition> = {
  Singles: {
    key: "Singles",
    label: "Singles",
    description: "One golfer against one golfer.",
    playersPerSide: 1,
    countsIndividualStats: true,
  },
  Fourball: {
    key: "Fourball",
    label: "Fourball",
    description: "Pairs, each golfer plays their own ball; the better score counts.",
    playersPerSide: 2,
    countsIndividualStats: true,
  },
  Foursome: {
    key: "Foursome",
    label: "Alternate Shot",
    description: "Pairs share one ball and take turns hitting it.",
    playersPerSide: 2,
    countsIndividualStats: false,
  },
};

export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

export function isFormatKey(value: unknown): value is FormatKey {
  return typeof value === "string" && Object.hasOwn(FORMATS, value);
}

/**
 * Matches one round can hold when two teams play each other: the smaller
 * team's size divided by golfers per side. For The Maroon's 6-a-side
 * teams this is Singles 6, Fourball/Foursome 3 — the same numbers
 * lib/live/orchestration.ts hard-codes today.
 */
export function matchesPerRound(format: FormatKey, smallerTeamSize: number): number {
  if (!Number.isInteger(smallerTeamSize) || smallerTeamSize < 0) return 0;
  return Math.floor(smallerTeamSize / FORMATS[format].playersPerSide);
}

/** How many matches go off one tee time (Singles pairs up, 2 matches per group of 4). */
export function matchesPerTeeTime(format: FormatKey): number {
  return Math.max(1, Math.floor(GROUP_SIZE / (2 * FORMATS[format].playersPerSide)));
}

/** Tee times a round needs: The Maroon's 3 for every format, 4 for a 16-player event. */
export function teeTimesPerRound(format: FormatKey, smallerTeamSize: number): number {
  return Math.ceil(matchesPerRound(format, smallerTeamSize) / matchesPerTeeTime(format));
}
