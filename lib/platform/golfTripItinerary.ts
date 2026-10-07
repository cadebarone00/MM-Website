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
  /** Optional end, same format (e.g. a flight's landing): it's happening from startsAt until then. */
  endsAt?: string;
  /** A golf round's number (its tee time, or the round itself when I'm not on a tee time yet). */
  round?: number;
  /** No tee time yet: the time only places it in the day (morning / afternoon) and shows as "Tee time TBD". */
  timeTbd?: boolean;
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
 * Golf rounds always show on everyone's itinerary. A tee time I'm on is that round ("Round N" in its details); a round
 * I'm not on a tee time for yet is added on its day with "Tee time TBD" — placed in the morning (first round of the day)
 * or the afternoon (second). `rounds`: the trip's rounds in order, each with its date and course.
 */
export function withGolfRounds(items: ItineraryItem[], rounds: { number: number; date: string; course: string }[]): ItineraryItem[] {
  const roundOf = (item: ItineraryItem) => item.kind === "teeTime" ? Number(/Round (\d+)/.exec(`${item.detail ?? ""} ${item.title}`)?.[1]) || undefined : undefined;
  const tagged = items.map((item) => { const round = roundOf(item); return round ? { ...item, round } : item; });
  const onTeeTime = new Set(tagged.map((item) => item.round).filter(Boolean));
  const added = rounds.filter((round) => round.date && !onTeeTime.has(round.number)).map((round) => {
    const morning = rounds.filter((other) => other.date === round.date).findIndex((other) => other.number === round.number) === 0;
    return { id: `round-${round.number}`, kind: "teeTime" as const, title: round.course, detail: `Round ${round.number}`, startsAt: `${round.date}T${morning ? "07:00" : "12:30"}`, round: round.number, timeTbd: true };
  });
  return sortItinerary([...tagged, ...added]);
}

/** Without an end time, how long a plan counts as happening ("NOW") after it starts, in minutes. */
export const HAPPENING_MINUTES: Record<ItineraryKind, number> = { flight: 30, lodging: 30, teeTime: 0, ride: 30, dining: 90, other: 60 };

export type HomeStatus = "LIVE" | "NOW" | "NEXT" | "UPCOMING";

const minutesOf = (local: string) => Date.parse(`${local.slice(0, 16)}:00Z`) / 60000;

/** Happening right now: started, and before its end (or before its kind's usual length is up). */
export function isHappening(item: ItineraryItem, now: string): boolean {
  const start = minutesOf(item.startsAt), at = minutesOf(now);
  const end = item.endsAt ? minutesOf(item.endsAt) : start + HAPPENING_MINUTES[item.kind];
  return at >= start && at < end;
}

/**
 * Home's two boxes, each with its status (top right):
 * - A golf round in play (`liveRound`) is LIVE (the only red, dotted status) and wins over anything else; then NEXT.
 * - Otherwise something happening now (a flight in the air, a check-in, dinner) is NOW; then NEXT.
 * - Nothing happening (before the trip, between plans, everyone's rounds submitted): NEXT, then UPCOMING.
 * Missing ones are left out. `now` is local time, "YYYY-MM-DDTHH:mm".
 */
export function homeBoxes(items: ItineraryItem[], now: string, liveRound?: ItineraryItem): { status: HomeStatus; item: ItineraryItem }[] {
  const sorted = sortItinerary(items);
  const happening = sorted.filter((item) => isHappening(item, now)).at(-1);
  const current = liveRound ? { status: "LIVE" as const, item: liveRound } : happening ? { status: "NOW" as const, item: happening } : null;
  const later = sorted.filter((item) => item.startsAt > now.slice(0, 16) && item !== current?.item);
  if (current) return [current, ...later.slice(0, 1).map((item) => ({ status: "NEXT" as const, item }))];
  return later.slice(0, 2).map((item, index) => ({ status: index === 0 ? "NEXT" as const : "UPCOMING" as const, item }));
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

/**
 * The category in an Itinerary box's top-right corner: the kind, made more specific where we can tell —
 * rental car pickups/returns read "Rental car", and dining reads Breakfast (before 11 AM), Lunch (before 4 PM) or Dinner.
 */
export function itineraryCategory(item: Pick<ItineraryItem, "kind" | "title" | "startsAt">): string {
  if (item.kind === "ride" && /^rental car/i.test(item.title)) return "Rental car";
  if (item.kind === "dining") {
    const hour = Number(item.startsAt.slice(11, 13));
    return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : "Dinner";
  }
  return ITINERARY_KIND_LABEL[item.kind];
}

/** The Itinerary's day selector: "Thursday" over "April 22, 2027". */
export function itineraryWeekday(local: string): string {
  return asUtc(local.slice(0, 10)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
export function itineraryLongDate(local: string): string {
  return asUtc(local.slice(0, 10)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
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
