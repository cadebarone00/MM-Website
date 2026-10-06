/**
 * A trip's itinerary: flights, lodging, tee times, rides and dining, each at a local trip time. Shown as the Home
 * "what's next" cards (the next few things) and the Info → Itinerary list (everything, by day). Built from trip travel
 * (lib/platform/tripTravel.ts: itineraryFor); only the dev mock trip has travel for now. Safe to import anywhere.
 */
export type ItineraryKind = "flight" | "lodging" | "teeTime" | "ride" | "dining" | "other";

export interface ItineraryItem {
  id: string;
  kind: ItineraryKind;
  /** The headline, e.g. "AA1234 · RDU → DFW", "The Shorebreak Villas", "Desert Pines GC". */
  title: string;
  /** One more line, e.g. "Check-in · 3 nights", "Round 1 · 4 players". */
  detail?: string;
  /** Local trip time, "YYYY-MM-DDTHH:mm". */
  startsAt: string;
}

export const ITINERARY_KIND_LABEL: Record<ItineraryKind, string> = {
  flight: "Flight", lodging: "Lodging", teeTime: "Tee time", ride: "Ride", dining: "Dining", other: "Plans",
};

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** In time order (stable for equal times); items with a malformed time are left out. */
export function sortItinerary(items: ItineraryItem[]): ItineraryItem[] {
  return items.filter((item) => LOCAL_TIME.test(item.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The next `count` things that haven't started yet, soonest first. `now` is local time, "YYYY-MM-DDTHH:mm". */
export function upcomingItinerary(items: ItineraryItem[], now: string, count = 5): ItineraryItem[] {
  return sortItinerary(items).filter((item) => item.startsAt >= now).slice(0, count);
}

/**
 * Everything, grouped by day in order: [{ day: "2027-04-22", items }, …]. `tripDays` ("YYYY-MM-DD", e.g. every day of the
 * trip) are always included, even with no items (items: []); days outside them still show if something is on them.
 */
export function itineraryByDay(items: ItineraryItem[], tripDays: string[] = []): { day: string; items: ItineraryItem[] }[] {
  const byDay = new Map<string, ItineraryItem[]>();
  for (const day of tripDays) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) byDay.set(day, []);
  for (const item of sortItinerary(items)) {
    const day = item.startsAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, dayItems]) => ({ day, items: dayItems }));
}

const asUtc = (local: string) => new Date(`${local.length === 10 ? `${local}T00:00` : local}:00Z`);

/** "Thu, Apr 22" for a day ("YYYY-MM-DD") or the day of a local time. */
export function itineraryDay(local: string): string {
  return asUtc(local.slice(0, 10)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "6:10 AM" for a local time. */
export function itineraryTime(local: string): string {
  return asUtc(local).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** The current local time as "YYYY-MM-DDTHH:mm" (to compare with itinerary times). */
export function localNow(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
