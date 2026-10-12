import { sortItinerary, type ItineraryItem } from "./golfTripItinerary";

/**
 * Trip travel: everyone's flights, rides, lodging and plans, who's going on what, and each member's itinerary (derived,
 * never stored). Dev only for now — the mock trip keeps this in page state; it's shaped to become database tables later.
 * Safe to import anywhere. See project_specs.md, "Golf Trip Info — My Info, group travel…".
 */

export interface TripMember {
  id: string;
  name: string;
  role: "organizer" | "player";
}

export type TravelKind = "flight" | "ride" | "lodging" | "dining" | "teeTime" | "other";

/** Public details only (no confirmation numbers). Which fields matter depends on the kind. */
export interface TravelDetails {
  /** flight */
  airline?: string;
  flightNumber?: string;
  from?: string;
  to?: string;
  /** ride */
  rideType?: "driving" | "rental";
  seats?: number;
  /** lodging, dining, other, tee time */
  name?: string;
  place?: string;
  note?: string;
}

export interface TravelItem {
  id: string;
  kind: TravelKind;
  details: TravelDetails;
  /** Local trip time, "YYYY-MM-DDTHH:mm": departs / pickup / check-in / reservation / tee time. */
  startsAt: string;
  /** Optional end: lands / drop-off / check-out. */
  endsAt?: string;
  createdBy: string;
  /** "mine" = a member's own booking; "organizer" = put on people's itineraries by the organizer. */
  source: "mine" | "organizer";
  /** Who else can join (rides, plans): nobody, only people invited, or anyone who asks. */
  joinPolicy: "none" | "invite" | "open";
  /** Tee times can't be opted out of; other organizer assignments can. */
  optOutAllowed: boolean;
}

export type ParticipantStatus = "going" | "requested" | "invited" | "declined" | "optedOut";

export interface TravelParticipant {
  itemId: string;
  memberId: string;
  status: ParticipantStatus;
}

export interface TripTravel {
  members: TripMember[];
  /** The member using the app. */
  meId: string;
  items: TravelItem[];
  participants: TravelParticipant[];
}

// ---------- Editing (immutable: each returns a new TripTravel) ----------

/** Adds my own item and puts me on it. */
export function addMyItem(travel: TripTravel, item: Omit<TravelItem, "createdBy" | "source" | "optOutAllowed">): TripTravel {
  const created: TravelItem = { ...item, createdBy: travel.meId, source: "mine", optOutAllowed: true };
  return { ...travel, items: [...travel.items, created], participants: [...travel.participants, { itemId: created.id, memberId: travel.meId, status: "going" }] };
}

const isMine = (travel: TripTravel, item: TravelItem) => item.createdBy === travel.meId && item.source === "mine";

/** Changes one of my own bookings (anything else, including organizer items, is left alone). */
export function updateMyItem(travel: TripTravel, id: string, changes: Pick<TravelItem, "details" | "startsAt" | "endsAt" | "joinPolicy">): TripTravel {
  return { ...travel, items: travel.items.map((item) => item.id === id && isMine(travel, item) ? { ...item, ...changes } : item) };
}

/** Deletes one of my own bookings, and everyone's place on it. */
export function removeMyItem(travel: TripTravel, id: string): TripTravel {
  const item = travel.items.find((candidate) => candidate.id === id);
  if (!item || !isMine(travel, item)) return travel;
  return { ...travel, items: travel.items.filter((candidate) => candidate.id !== id), participants: travel.participants.filter((p) => p.itemId !== id) };
}

/**
 * Invites other members to one of my own bookings (Save & Invite). Skips me, anyone not on the trip, and anyone already
 * invited or going; someone who declined is invited again. Anything that isn't mine is left alone.
 */
export function inviteToItem(travel: TripTravel, itemId: string, memberIds: string[]): TripTravel {
  const item = travel.items.find((candidate) => candidate.id === itemId);
  if (!item || !isMine(travel, item)) return travel;
  const statusOf = (memberId: string) => travel.participants.find((p) => p.itemId === itemId && p.memberId === memberId)?.status;
  const invitees = [...new Set(memberIds)].filter((id) => id !== travel.meId && travel.members.some((m) => m.id === id) && statusOf(id) !== "invited" && statusOf(id) !== "going");
  if (!invitees.length) return travel;
  const others = travel.participants.filter((p) => !(p.itemId === itemId && invitees.includes(p.memberId)));
  return { ...travel, participants: [...others, ...invitees.map((memberId) => ({ itemId, memberId, status: "invited" as const }))] };
}

/** My Accept / Decline on something I was invited to (can change my mind either way). Nothing happens if I wasn't invited. */
export function respondToInvite(travel: TripTravel, itemId: string, answer: "accept" | "decline"): TripTravel {
  const invited = (p: TravelParticipant) => p.itemId === itemId && p.memberId === travel.meId && (p.status === "invited" || p.status === "going" || p.status === "declined");
  const item = travel.items.find((candidate) => candidate.id === itemId);
  if (!item || item.source !== "mine" || item.createdBy === travel.meId || !travel.participants.some(invited)) return travel;
  const status = answer === "accept" ? "going" as const : "declined" as const;
  return { ...travel, participants: travel.participants.map((p) => invited(p) ? { ...p, status } : p) };
}

/** My own bookings (not organizer items), in time order. */
export function myItems(travel: TripTravel): TravelItem[] {
  return travel.items.filter((item) => isMine(travel, item)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// ---------- Display ----------

const timeOf = (local: string) => new Date(`${local}:00Z`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** The headline for an item: "AA1234 · RDU → DFW", "Rental car", "Driving from Scottsdale", "The Shorebreak Villas". */
export function travelTitle(item: TravelItem): string {
  const d = item.details;
  if (item.kind === "flight") return [`${d.flightNumber ?? ""}`.trim(), d.from && d.to ? `${d.from} → ${d.to}` : ""].filter(Boolean).join(" · ") || "Flight";
  if (item.kind === "ride") return d.rideType === "rental" ? "Rental car" : d.from ? `Driving from ${d.from}` : "Driving";
  return d.name || (item.kind === "teeTime" ? "Tee time" : item.kind === "dining" ? "Dinner" : item.kind === "lodging" ? "Lodging" : "Plans");
}

/**
 * Itinerary entries for one member: every item they're going on, plus anything another member invited them to (going,
 * still deciding, or declined), marked with `invite` so the box can show Decline / Accept. Lodging and rental cars with an
 * end time become two entries (check-in / check-out, pickup / return); a flight shows when it lands.
 */
export function itineraryFor(travel: TripTravel, memberId = travel.meId): ItineraryItem[] {
  const statusOf = new Map(travel.participants.filter((p) => p.memberId === memberId && (p.status === "going" || p.status === "invited" || p.status === "declined")).map((p) => [p.itemId, p.status]));
  const entries: ItineraryItem[] = [];
  for (const item of travel.items) {
    const status = statusOf.get(item.id);
    if (!status) continue;
    // Someone else's own booking I'm on = an invite (organizer items are assignments, not invites).
    const invitedBy = item.source === "mine" && item.createdBy !== memberId ? travel.members.find((m) => m.id === item.createdBy)?.name ?? "" : undefined;
    if (invitedBy === undefined && status !== "going") continue;
    const start = entries.length;
    const d = item.details, title = travelTitle(item);
    if (item.kind === "flight") {
      entries.push({ id: item.id, kind: "flight", title, startsAt: item.startsAt, ...(item.endsAt ? { endsAt: item.endsAt } : {}), detail: [d.airline, item.endsAt && `Lands ${timeOf(item.endsAt)}`].filter(Boolean).join(" · ") || undefined });
    } else if (item.kind === "lodging") {
      entries.push({ id: `${item.id}:in`, kind: "lodging", title, startsAt: item.startsAt, detail: ["Check-in", d.place].filter(Boolean).join(" · ") });
      if (item.endsAt) entries.push({ id: `${item.id}:out`, kind: "lodging", title, startsAt: item.endsAt, detail: "Check-out" });
    } else if (item.kind === "ride") {
      const rental = d.rideType === "rental";
      entries.push({ id: `${item.id}:start`, kind: "ride", title: rental ? "Rental car pickup" : title, startsAt: item.startsAt,
        detail: [rental ? d.place || d.from : d.to && `To ${d.to}`, d.seats ? `${d.seats} seat${d.seats === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || undefined });
      if (item.endsAt) entries.push({ id: `${item.id}:end`, kind: "ride", title: rental ? "Rental car return" : `${title} · Back`, startsAt: item.endsAt, detail: rental ? d.place || d.from : undefined });
    } else {
      entries.push({ id: item.id, kind: item.kind, title, startsAt: item.startsAt, detail: [d.place, d.note].filter(Boolean).join(" · ") || undefined });
    }
    if (invitedBy !== undefined) for (let i = start; i < entries.length; i++) entries[i] = { ...entries[i], invite: { itemId: item.id, from: invitedBy, status: status as "going" | "invited" | "declined" } };
  }
  return sortItinerary(entries);
}

/** Only what I'm actually going on (drops invites I haven't accepted) — for Home's boxes, Venue and reminders. */
export const goingOnly = (items: ItineraryItem[]): ItineraryItem[] => items.filter((item) => !item.invite || item.invite.status === "going");

// ---------- Form checks ----------

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const FLIGHT_NUMBER = /^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/;
const AIRPORT = /^[A-Z]{3}$/;

/** What's wrong with a new / edited item, by field (empty = fine). Text is trimmed and airport / flight codes upper-cased first. */
export function checkTravelInput(kind: TravelKind, details: TravelDetails, startsAt: string, endsAt?: string): Partial<Record<"flightNumber" | "from" | "to" | "seats" | "name" | "startsAt" | "endsAt", string>> {
  const problems: ReturnType<typeof checkTravelInput> = {};
  if (!LOCAL_TIME.test(startsAt)) problems.startsAt = "Pick a date and time.";
  if (endsAt && !LOCAL_TIME.test(endsAt)) problems.endsAt = "Pick a date and time.";
  else if (endsAt && LOCAL_TIME.test(startsAt) && endsAt <= startsAt) problems.endsAt = "Must be after the start.";
  if (kind === "flight") {
    if (!FLIGHT_NUMBER.test((details.flightNumber ?? "").toUpperCase().trim())) problems.flightNumber = "Like AA1234.";
    if (!AIRPORT.test((details.from ?? "").toUpperCase().trim())) problems.from = "3-letter airport code, like RDU.";
    if (!AIRPORT.test((details.to ?? "").toUpperCase().trim())) problems.to = "3-letter airport code, like PHX.";
  }
  if (kind === "ride" && details.seats !== undefined && (!Number.isInteger(details.seats) || details.seats < 0 || details.seats > 12)) problems.seats = "0 to 12 open seats.";
  if ((kind === "lodging" || kind === "other") && !(details.name ?? "").trim()) problems.name = kind === "lodging" ? "Where are you staying?" : "What is it?";
  if (kind === "ride" && details.rideType === "driving" && !(details.from ?? "").trim()) problems.from = "Where are you driving from?";
  return problems;
}

/** Trims text and upper-cases codes, ready to save. */
export function cleanDetails(kind: TravelKind, details: TravelDetails): TravelDetails {
  const text = (value?: string) => value?.trim() || undefined;
  if (kind === "flight") return { airline: text(details.airline), flightNumber: text(details.flightNumber)?.toUpperCase().replace(/\s+/, ""), from: text(details.from)?.toUpperCase(), to: text(details.to)?.toUpperCase() };
  if (kind === "ride") return { rideType: details.rideType ?? "driving", from: text(details.from), to: text(details.to), place: text(details.place), seats: details.seats };
  return { name: text(details.name), place: text(details.place), note: text(details.note) };
}
