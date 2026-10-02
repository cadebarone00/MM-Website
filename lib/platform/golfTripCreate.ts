import { plannedRounds, tripDates, type GolfTripDraft } from "./golfTripDraft.ts";

/**
 * Create Golf Trip: turns the questionnaire draft into the one payload supabase/golf_trips.sql's
 * create_golf_trip accepts (and back again for Golf Trip Home). The server re-checks everything here;
 * the questionnaire's own checks are only for the Next button.
 */
export type PlanAnswer = "yes" | "no" | "undecided";

export interface CreateGolfTripPayload {
  requestId: string;
  name: string;
  destination: string;
  /** From the picked Google Places suggestion; all three or all null (typed by hand). */
  latitude: number | null;
  longitude: number | null;
  externalPlaceId: string | null;
  startDate: string;
  endDate: string;
  expectedTravelerCount: number | null;
  organizer: { displayName: string; email: string };
  golfDays: number;
  rounds: { roundNumber: number; dayNumber: number; playDate: string | null; courseName: string | null }[];
  includesTournament: PlanAnswer;
  lodgingPlan: PlanAnswer;
  flightPlan: PlanAnswer;
  transportationPlan: PlanAnswer;
}

export interface GolfTripFieldError { field: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANSWERS: readonly PlanAnswer[] = ["yes", "no", "undecided"];

export function isGolfTripId(value: string): boolean {
  return UUID.test(value);
}

export function golfTripUrl(tripId: string): string {
  return `/golf-trips/${tripId}`;
}

/** Join a Trip: the trip id from a pasted Trip ID or trip link (…/golf-trips/<id>), or null when there isn't one. */
export function tripIdFromJoinInput(input: string): string | null {
  const value = input.trim();
  if (isGolfTripId(value)) return value.toLowerCase();
  const fromLink = value.match(/\/golf-trips\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1];
  return fromLink && isGolfTripId(fromLink) ? fromLink.toLowerCase() : null;
}

/** Validates the questionnaire draft (sent as-is by the Review page) and builds the create payload. */
export function golfTripPayloadFromBody(body: unknown):
  { ok: true; payload: CreateGolfTripPayload } | { ok: false; errors: GolfTripFieldError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: [{ field: "body", message: "Invalid request." }] };
  const draft: GolfTripDraft = {};
  for (const [key, value] of Object.entries(body)) if (typeof value === "string") draft[key] = value;

  const errors: GolfTripFieldError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });
  const text = (key: string) => (draft[key] ?? "").trim();

  const requestId = text("requestId");
  if (!UUID.test(requestId)) fail("requestId", "Invalid request.");

  const name = text("tripName");
  if (!name) fail("tripName", "Add a trip name.");
  else if (name.length > 120) fail("tripName", "Keep the trip name under 120 characters.");

  const destination = text("destination");
  if (!destination) fail("destination", "Add a destination.");
  else if (destination.length > 200) fail("destination", "Keep the destination under 200 characters.");
  const place = destinationPlace(text("destinationPlaceId"), text("destinationLatitude"), text("destinationLongitude"));

  const dates = tripDates(draft.startDate, draft.endDate);
  if (!dates.length) fail("dates", "Add a start and end date (the end can't be before the start).");
  else if (dates[dates.length - 1] !== draft.endDate) fail("dates", "Trips can be up to 31 days long.");

  const countText = text("playerCount");
  const count = countText ? Number(countText) : null;
  if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= 100)) fail("playerCount", "Pick how many players are going.");

  const displayName = text("yourName");
  if (!displayName) fail("yourName", "Add your name.");
  else if (displayName.length > 120) fail("yourName", "Keep your name under 120 characters.");
  const email = text("yourEmail");
  if (!EMAIL.test(email) || email.length > 254) fail("yourEmail", "Add a valid email.");

  const golfDays = Number(text("golfDays"));
  if (!(Number.isInteger(golfDays) && golfDays >= 1 && golfDays <= Math.max(dates.length, 1))) fail("golfDays", "Add at least one golf day within the trip.");

  const rounds = Number.isInteger(golfDays) && golfDays >= 1 ? plannedRounds(draft) : [];
  for (const round of dates.length ? rounds : []) {
    if (round.date && !dates.includes(round.date)) { fail("rounds", "Every golf day has to fall within the trip dates."); break; }
  }
  for (const round of rounds) {
    if ((draft[`round${round.number}Course`] ?? "").trim().length > 200) { fail("rounds", "Keep course names under 200 characters."); break; }
  }

  const answer = (key: string): PlanAnswer => {
    const value = text(key) as PlanAnswer;
    if (!ANSWERS.includes(value)) { fail(key, "Pick Yes, No or Not sure yet."); return "undecided"; }
    return value;
  };
  const includesTournament = answer("includesTournament");
  const lodgingPlan = answer("knowsLodging");
  const flightPlan = answer("knowsFlights");
  const transportationPlan = answer("knowsTransportation");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      requestId: requestId.toLowerCase(), name, destination, ...place, startDate: draft.startDate, endDate: draft.endDate,
      expectedTravelerCount: count, organizer: { displayName, email }, golfDays,
      rounds: rounds.map((round) => ({
        roundNumber: round.number, dayNumber: round.dayNumber, playDate: round.date || null,
        courseName: (draft[`round${round.number}Course`] ?? "").trim() || null,
      })),
      includesTournament, lodgingPlan, flightPlan, transportationPlan,
    },
  };
}

/** The picked place's id and coordinates, or all null when any is missing, malformed or out of range (never an error). */
function destinationPlace(placeId: string, latitudeText: string, longitudeText: string):
  Pick<CreateGolfTripPayload, "latitude" | "longitude" | "externalPlaceId"> {
  const latitude = latitudeText ? Number(latitudeText) : NaN;
  const longitude = longitudeText ? Number(longitudeText) : NaN;
  const valid = /^[A-Za-z0-9_-]{1,300}$/.test(placeId)
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  return valid ? { latitude, longitude, externalPlaceId: placeId } : { latitude: null, longitude: null, externalPlaceId: null };
}

/** What a failed create_golf_trip call tells the person (their answers stay in the questionnaire either way). */
export function golfTripCreateFailure(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === "42501") return { status: 403, error: "Your account couldn't be found. Log out, log back in and try again." };
  if (error.code === "22023" || error.code === "23514") return { status: 400, error: "Some answers don't fit together. Go back and check your dates and golf days." };
  // Function or tables not installed yet (supabase/golf_trips.sql not run in this database).
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205") {
    return { status: 503, error: "Saving golf trips isn't switched on yet." };
  }
  return { status: 500, error: "We couldn't create your trip. Your answers are still here, so try again." };
}

export type GolfTripRole = "organizer" | "member";

/** The signed-in person's place on a trip, for UI that differs for the organizer. */
export interface GolfTripViewer { profileId: string; memberId: string; role: GolfTripRole; isOrganizer: boolean }

/** One row of the My Trips list (list_my_golf_trips). */
export interface GolfTripSummary {
  id: string; name: string; destination: string; startDate: string; endDate: string; status: string;
  expectedTravelerCount: number | null; memberCount: number; role: GolfTripRole;
}

export interface SavedGolfTrip {
  trip: {
    id: string; name: string; destination: string; start_date: string; end_date: string; expected_traveler_count: number | null;
    golf_days: number; planned_rounds: number; includes_tournament: PlanAnswer; lodging_plan: PlanAnswer; flight_plan: PlanAnswer;
    transportation_plan: PlanAnswer; tournament_id: string | null; status: string; created_by: string;
    /** Missing on a database that hasn't run the location columns in golf_trips.sql yet. */
    latitude?: number | null; longitude?: number | null; external_place_id?: string | null;
  };
  members: { id: string; profileId: string | null; displayName: string; email: string | null; role: GolfTripRole; invitationStatus: string }[];
  rounds: { roundNumber: number; dayNumber: number; playDate: string | null; courseName: string | null }[];
}

/** A saved trip in the questionnaire's shape, so Golf Trip Home shows it exactly like the answers it was made from. */
export function savedTripAsDraft({ trip, members, rounds }: SavedGolfTrip): GolfTripDraft {
  const organizer = members.find((member) => member.role === "organizer");
  const draft: GolfTripDraft = {
    tripName: trip.name, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date,
    playerCount: trip.expected_traveler_count === null ? "" : String(trip.expected_traveler_count),
    yourName: organizer?.displayName ?? "", yourEmail: organizer?.email ?? "", golfDays: String(trip.golf_days),
    includesTournament: trip.includes_tournament, knowsLodging: trip.lodging_plan, knowsFlights: trip.flight_plan,
    knowsTransportation: trip.transportation_plan,
  };
  for (const round of rounds) {
    draft[`day${round.dayNumber}Date`] = round.playDate ?? "";
    draft[`day${round.dayNumber}Rounds`] = String(rounds.filter((r) => r.dayNumber === round.dayNumber).length);
    draft[`round${round.roundNumber}Course`] = round.courseName ?? "";
  }
  return draft;
}

/** This person's membership on a saved trip, or null if they aren't on it. */
export function golfTripViewer(saved: SavedGolfTrip, profileId: string): GolfTripViewer | null {
  const member = saved.members.find((m) => m.profileId === profileId);
  return member ? { profileId, memberId: member.id, role: member.role, isOrganizer: member.role === "organizer" } : null;
}

/** list_my_golf_trips's reply, keeping only well-formed rows. */
export function golfTripSummaries(data: unknown): GolfTripSummary[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is GolfTripSummary => Boolean(row) && typeof row === "object"
    && typeof row.id === "string" && typeof row.name === "string" && (row.role === "organizer" || row.role === "member"));
}

/** My Trips: trips that haven't ended yet (soonest first) and past trips (most recent first). `today` is "YYYY-MM-DD". */
export function splitGolfTrips(trips: GolfTripSummary[], today: string): { upcoming: GolfTripSummary[]; past: GolfTripSummary[] } {
  return {
    upcoming: trips.filter((trip) => trip.endDate >= today),
    past: trips.filter((trip) => trip.endDate < today).reverse(),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Apr 22 – 26, 2027", "Apr 28 – May 2, 2027" or "Dec 30, 2027 – Jan 2, 2028". */
export function tripDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (![sy, sm, sd, ey, em, ed].every(Number.isFinite)) return "";
  const s = `${MONTHS[sm - 1]} ${sd}`;
  if (start === end) return `${s}, ${sy}`;
  if (sy !== ey) return `${s}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`;
  return sm === em ? `${s} – ${ed}, ${sy}` : `${s} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
}
