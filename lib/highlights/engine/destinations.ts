import type { PreferenceCategory } from "../metadata.ts";
import type { HighlightCategory } from "../types.ts";

/**
 * Where tapping a notification goes. Pure. Paths point at the saved trip with a tab / section / anchor hint; the trip
 * page doesn't read these hints yet (it opens on Home), so for now every link lands on the right trip.
 */

export interface Destination { path: string; label: string }

const RULE_TARGETS: Partial<Record<HighlightCategory, { query: string; anchor: string; label: string }>> = {
  "Individual performance": { query: "tab=Golf&section=Overview", anchor: "scoring", label: "Golf → round / scoring" },
  "Match play drama": { query: "tab=Golf&section=Competition", anchor: "matches", label: "Golf → Competition → match results" },
  "Team competition": { query: "tab=Golf&section=Competition", anchor: "teams", label: "Golf → Competition → team standings" },
  "Individual leaderboard": { query: "tab=Golf&section=Competition", anchor: "leaderboard", label: "Golf → Competition → leaderboard" },
  "Trip and tournament milestones": { query: "tab=Home", anchor: "momentum", label: "Home → trip activity" },
  "Fun and social highlights": { query: "tab=Home", anchor: "momentum", label: "Home → trip activity" },
};
const TRAVEL_TARGETS: Partial<Record<PreferenceCategory, { query: string; label: string }>> = {
  "flights-transportation": { query: "tab=Itinerary", label: "Itinerary → this flight / ride" },
  "trip-essentials": { query: "tab=Itinerary", label: "Itinerary → this item" },
  "group-announcements": { query: "tab=Home", label: "Home → announcements" },
};

export function destinationFor(tripId: string, rule: { category: HighlightCategory; id: string }, category: PreferenceCategory, itemId?: string | null): Destination {
  const base = `/golf-trips/${tripId}`;
  const golf = RULE_TARGETS[rule.category];
  if (golf) return { path: `${base}?${golf.query}#${golf.anchor}`, label: golf.label };
  // Tee times and pairings open the golf schedule rather than the general itinerary.
  if (/^TR-01[1-4]$/.test(rule.id)) return { path: `${base}?tab=Itinerary${itemId ? `#item-${itemId}` : ""}`, label: "Itinerary → golf schedule" };
  const travel = TRAVEL_TARGETS[category] ?? { query: "tab=Itinerary", label: "Itinerary" };
  const anchor = travel.query === "tab=Itinerary" && itemId ? `#item-${itemId}` : category === "group-announcements" && rule.id === "TR-020" ? "#announcements" : "";
  return { path: `${base}?${travel.query}${anchor}`, label: travel.label };
}
