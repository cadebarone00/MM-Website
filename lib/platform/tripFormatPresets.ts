import type { FORMAT_NAMES } from "./savedTripSetup.ts";

/**
 * Trip Builder → Formats (owner decision 2026-11-03). Top to bottom on the screen: a picture titled "The Maroon",
 * The Maroon Style (our format, with its tag), then the picks: Both (creates The Maroon Style setup), Individual and
 * Team side by side, then Create Your Own (mix and match per round, in the UI only).
 */
export type FormatName = (typeof FORMAT_NAMES)[number];
export type CompetitionTypes = { individual: "Stroke Play" | null; team: "2 Teams" | "Pairs" | null };
export type FormatPreset = {
  id: "maroon" | "individual" | "team"; label: string; blurb: string; tag: string | null;
  types: CompetitionTypes; formatForRound: (roundIndex: number, roundCount: number) => FormatName;
};

/** The Maroon Style's 8 rounds, in order (owner OK'd 2026-11-03). */
export const MAROON_ROUND_ORDER = ["Fourball", "Alternate Shot", "Fourball", "Singles", "Alternate Shot", "Fourball", "Singles", "Singles"] as const satisfies readonly FormatName[];

export const TRIP_FORMAT_PRESETS: readonly FormatPreset[] = [
  { id: "maroon", label: "Both", blurb: "Individual scores and team match play, The Maroon Style.", tag: "8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot",
    types: { individual: "Stroke Play", team: "2 Teams" },
    // Fewer than 8 rounds: the first ones in order. More than 8: the extra rounds are Singles.
    formatForRound: (index) => MAROON_ROUND_ORDER[index] ?? "Singles" },
  { id: "individual", label: "Individual", blurb: "Everyone plays for themselves. Stroke play every round.", tag: null,
    types: { individual: "Stroke Play", team: null }, formatForRound: () => "Stroke Play" },
  { id: "team", label: "Team", blurb: "Team match play. Fourball to start; change any round in Settings.", tag: null,
    types: { individual: null, team: "2 Teams" }, formatForRound: () => "Fourball" },
];

export const presetById = (id: string | undefined): FormatPreset | null => TRIP_FORMAT_PRESETS.find(preset => preset.id === id) ?? null;
