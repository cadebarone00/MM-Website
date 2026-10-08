/** Shared navigation vocabulary for the trip UI and development page shortcuts. */
export const GOLF_TRIP_TABS = ["Home", "Golf", "Venue", "Itinerary"] as const;
export const GOLF_TRIP_SECTIONS = ["Overview", "Competition", "Games", "Stats"] as const;
export type GolfTripTab = (typeof GOLF_TRIP_TABS)[number];
export type GolfTripSection = (typeof GOLF_TRIP_SECTIONS)[number];
export type GolfTripNavigation = { tab: GolfTripTab; golfSection?: GolfTripSection; settingsView?: string; command?: number };

/** Which kinds of competition the trip has: an individual tournament, a team event, both, or neither. */
export type CompetitionStructure = { individual: boolean; team: boolean };

/**
 * The Golf tab's sections and their names for the trip's competition (owner's rules, 2026-10-06):
 * none → Overview · Games · Stats (stats are required or each player's choice, so the section is always there);
 * individual → Leaderboard · Games; team → Matches · Games; both → Leaderboard · Matches · Games — those add Stats after
 * Games while Player Stats is required (Organizer → Player Scoring).
 * `id` stays the shared section name (navigation / dev shortcuts); `label` is what the tab says.
 */
export function golfSections(structure: CompetitionStructure, stats = false): { id: GolfTripSection; label: string }[] {
  const { individual, team } = structure;
  const statsTab = stats ? [{ id: "Stats" as const, label: "Stats" }] : [];
  if (!individual && !team) return [{ id: "Overview", label: "Overview" }, { id: "Games", label: "Games" }, { id: "Stats", label: "Stats" }];
  return [
    ...(individual ? [{ id: "Overview" as const, label: "Leaderboard" }] : []),
    ...(team ? [{ id: "Competition" as const, label: "Matches" }] : []),
    { id: "Games", label: "Games" },
    ...statsTab,
  ];
}
