import type { SavedGolfTrip, GolfTripViewer } from "./golfTripCreate";
import type { TripTravel } from "./tripTravel";
export type SavedTravelSnapshot = { travel: TripTravel; revision: number; available: boolean };
export function privateTripTravel(trip: SavedGolfTrip, viewer: GolfTripViewer): TripTravel {
  const me = trip.members.find(member => member.id === viewer.memberId)!;
  return { meId: viewer.memberId, members: [{ id: viewer.memberId, name: me.displayName, role: viewer.isOrganizer ? "organizer" : "player" }], items: [], participants: [] };
}
/** Personal plans only. Group invitations require a separate server-backed protocol. */
export function validPrivateTravel(value: unknown, memberId: string): value is Pick<TripTravel, "items" | "participants"> {
  if (!value || typeof value !== "object" || JSON.stringify(value).length > 100000) return false;
  const travel = value as TripTravel;
  if (!Array.isArray(travel.items) || travel.items.length > 100 || !Array.isArray(travel.participants) || travel.participants.length > 100) return false;
  const ids = new Set<string>();
  for (const item of travel.items) {
    if (!item || typeof item.id !== "string" || item.id.length > 100 || ids.has(item.id) || item.createdBy !== memberId || item.source !== "mine" || !["flight", "ride", "lodging", "dining", "teeTime", "other"].includes(item.kind)) return false;
    ids.add(item.id);
    if (typeof item.startsAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.startsAt) || !Number.isFinite(Date.parse(item.startsAt))) return false;
    if (item.endsAt && (!Number.isFinite(Date.parse(item.endsAt)) || item.endsAt < item.startsAt)) return false;
    if (!item.details || typeof item.details !== "object" || Array.isArray(item.details) || !Object.values(item.details).every(text => text === undefined || typeof text === "string" && text.length <= 1000)) return false;
  }
  return travel.participants.every(participant => participant && ids.has(participant.itemId) && participant.memberId === memberId && participant.status === "going");
}
