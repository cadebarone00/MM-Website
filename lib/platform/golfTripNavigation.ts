/** Shared navigation vocabulary for the trip UI and development page shortcuts. */
export const GOLF_TRIP_TABS = ["Home", "Golf", "Venue", "Itinerary"] as const;
export const GOLF_TRIP_SECTIONS = ["Overview", "Competition", "Games"] as const;
export type GolfTripTab = (typeof GOLF_TRIP_TABS)[number];
export type GolfTripSection = (typeof GOLF_TRIP_SECTIONS)[number];
export type GolfTripNavigation = { tab: GolfTripTab; golfSection?: GolfTripSection; settingsView?: string; command?: number };

/** Which kinds of competition the trip has: an individual tournament, a team event, both, or neither. */
export type CompetitionStructure = { individual: boolean; team: boolean };

/**
 * The Golf tab's sections and their names for the trip's competition (owner's rules, 2026-10-06):
 * none → Overview · Games; individual → Leaderboard · Games; team → Matches · Games; both → Leaderboard · Matches · Games.
 * `id` stays the shared section name (navigation / dev shortcuts); `label` is what the tab says.
 */
export function golfSections(structure: CompetitionStructure): { id: GolfTripSection; label: string }[] {
  const { individual, team } = structure;
  if (!individual && !team) return [{ id: "Overview", label: "Overview" }, { id: "Games", label: "Games" }];
  return [
    ...(individual ? [{ id: "Overview" as const, label: "Leaderboard" }] : []),
    ...(team ? [{ id: "Competition" as const, label: "Matches" }] : []),
    { id: "Games", label: "Games" },
  ];
}
