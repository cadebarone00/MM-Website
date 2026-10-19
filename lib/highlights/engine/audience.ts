import type { AudienceScope } from "../metadata.ts";

/**
 * Who an alert is for. Pure. Golf highlights go to every trip member; travel alerts go to the scope the sheet names,
 * resolved against the itinerary item (its travelers, driver, tee group, attendees) or an organizer's selection.
 */

export interface AudienceContext {
  /** Everyone on the trip. */
  members: string[];
  /** The itinerary item the alert is about, if any. */
  item?: { travelers: string[]; driver?: string | null } | null;
  /** The round's players and the recipient-relevant tee group. */
  round?: { players: string[]; teeGroup: string[] } | null;
  /** Organizer-picked recipients (announcements, "selected travelers"); null / empty = everyone. */
  selected?: string[] | null;
}

/** The member ids an alert of this scope goes to (no duplicates, trip members only). */
export function recipients(scope: AudienceScope | "trip-members", context: AudienceContext): string[] {
  const members = new Set(context.members);
  const list = (() => {
    switch (scope) {
      case "trip-members": case "trip": return context.members;
      case "item-travelers": case "event-attendees": return context.item?.travelers ?? [];
      case "transport-group": return [...(context.item?.travelers ?? []), ...(context.item?.driver ? [context.item.driver] : [])];
      case "round-players": return context.round?.players ?? [];
      case "tee-group": return context.round?.teeGroup ?? [];
      case "selected": return context.selected?.length ? context.selected : context.members;
    }
  })();
  return [...new Set(list)].filter((id) => members.has(id));
}

export const AUDIENCE_LABELS: Record<AudienceScope | "trip-members", string> = {
  "trip-members": "Everyone on the trip", trip: "Entire trip", "item-travelers": "Travelers on this item", "transport-group": "Passengers and driver",
  "round-players": "Players in this round", "tee-group": "This tee group", "event-attendees": "Event attendees", selected: "Selected travelers (or everyone)",
};
