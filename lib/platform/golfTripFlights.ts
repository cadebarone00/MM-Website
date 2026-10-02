/**
 * Golf Trip Info → Flights: each traveler's own flights, typed in by hand (supabase/golf_trip_flights.sql).
 * The checks here run for the form's Save button and again on the server; the database repeats the important ones.
 * Safe to import anywhere (no secrets, no network calls).
 */

export type FlightDirection = "arrival" | "return";

export const FLIGHT_DIRECTIONS: { value: FlightDirection; label: string }[] = [
  { value: "arrival", label: "Getting There" },
  { value: "return", label: "Heading Home" },
];

/** What the form sends (and save_golf_trip_flight accepts). Times are "YYYY-MM-DDTHH:MM", local to each airport. */
export interface FlightInput {
  id: string | null;
  direction: FlightDirection;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureLocal: string;
  arrivalLocal: string;
  confirmationNumber: string | null;
  notes: string | null;
}

/** A saved flight. The provider fields are empty until a flight-data provider exists; the card shows them if set. */
export interface GolfTripFlight extends Omit<FlightInput, "id"> {
  id: string;
  source: "manual" | "provider";
  liveStatus: string | null;
  departureTerminal: string | null;
  departureGate: string | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
}

export interface FlightFieldError { field: string; message: string }

export const MAX_FLIGHTS_PER_TRIP = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2027-04-22T07:05" is a real date and time (no timezone). */
export function isLocalDateTime(value: string): boolean {
  const match = LOCAL_TIME.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && h < 24 && mi < 60;
}

/** Capital letters and digits only: "aa 1234" → "AA1234", "abc-12d" → "ABC12D". */
const code = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Checks the Add / Edit flight form and builds what save_golf_trip_flight accepts. */
export function flightInputFromBody(body: unknown): { ok: true; flight: FlightInput } | { ok: false; errors: FlightFieldError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: [{ field: "body", message: "Invalid request." }] };
  const raw = body as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  const errors: FlightFieldError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });

  const id = text("id");
  if (id && !UUID.test(id)) fail("id", "Invalid request.");

  const direction = text("direction") as FlightDirection;
  if (direction !== "arrival" && direction !== "return") fail("direction", "Pick Getting There or Heading Home.");

  const airline = text("airline");
  if (!airline) fail("airline", "Add the airline.");
  else if (airline.length > 60) fail("airline", "Keep the airline under 60 characters.");

  const flightNumber = code(text("flightNumber"));
  if (!flightNumber) fail("flightNumber", "Add the flight number.");
  else if (flightNumber.length > 8) fail("flightNumber", "Flight numbers are up to 8 letters and numbers, like AA1234.");

  const departureAirport = text("departureAirport").toUpperCase();
  const arrivalAirport = text("arrivalAirport").toUpperCase();
  if (!/^[A-Z]{3}$/.test(departureAirport)) fail("departureAirport", "Use the 3-letter airport code, like DFW.");
  if (!/^[A-Z]{3}$/.test(arrivalAirport)) fail("arrivalAirport", "Use the 3-letter airport code, like RDU.");
  else if (arrivalAirport === departureAirport) fail("arrivalAirport", "From and To can't be the same airport.");

  const departureLocal = text("departureLocal");
  const arrivalLocal = text("arrivalLocal");
  if (!isLocalDateTime(departureLocal)) fail("departureLocal", "Add the departure date and time.");
  if (!isLocalDateTime(arrivalLocal)) fail("arrivalLocal", "Add the arrival date and time.");

  const confirmationNumber = code(text("confirmationNumber"));
  if (confirmationNumber.length > 12) fail("confirmationNumber", "Confirmation numbers are up to 12 letters and numbers.");

  const notes = text("notes");
  if (notes.length > 500) fail("notes", "Keep notes under 500 characters.");

  if (errors.length) return { ok: false, errors };
  return { ok: true, flight: { id: id ? id.toLowerCase() : null, direction, airline, flightNumber, departureAirport, arrivalAirport,
    departureLocal, arrivalLocal, confirmationNumber: confirmationNumber || null, notes: notes || null } };
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
/** "2027-04-22T07:05:00" (Postgres timestamp) → "2027-04-22T07:05". */
const minutes = (value: unknown): string => (typeof value === "string" ? value.slice(0, 16) : "");

/** A database row (to_jsonb of golf_trip_flights) as our GolfTripFlight, or null when it's malformed. */
export function flightFromRow(row: unknown): GolfTripFlight | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || (r.direction !== "arrival" && r.direction !== "return")) return null;
  const departureLocal = minutes(r.departure_local);
  const arrivalLocal = minutes(r.arrival_local);
  if (!isLocalDateTime(departureLocal) || !isLocalDateTime(arrivalLocal)) return null;
  return {
    id: r.id, direction: r.direction, airline: String(r.airline ?? ""), flightNumber: String(r.flight_number ?? ""),
    departureAirport: String(r.departure_airport ?? ""), arrivalAirport: String(r.arrival_airport ?? ""), departureLocal, arrivalLocal,
    confirmationNumber: str(r.confirmation_number), notes: str(r.notes), source: r.source === "provider" ? "provider" : "manual",
    liveStatus: str(r.live_status), departureTerminal: str(r.departure_terminal), departureGate: str(r.departure_gate),
    arrivalTerminal: str(r.arrival_terminal), arrivalGate: str(r.arrival_gate),
  };
}

/** list_my_golf_trip_flights's reply, keeping only well-formed rows, in departure order. */
export function flightsFromRows(data: unknown): GolfTripFlight[] {
  if (!Array.isArray(data)) return [];
  return data.map(flightFromRow).filter((f): f is GolfTripFlight => f !== null).sort(byDeparture);
}

const byDeparture = (a: GolfTripFlight, b: GolfTripFlight) => a.departureLocal.localeCompare(b.departureLocal);

/** Getting There and Heading Home, each in departure order (connections sit together). */
export function groupFlights(flights: GolfTripFlight[]): Record<FlightDirection, GolfTripFlight[]> {
  const sorted = [...flights].sort(byDeparture);
  return { arrival: sorted.filter((f) => f.direction === "arrival"), return: sorted.filter((f) => f.direction === "return") };
}

export interface FlightSummary {
  /** The first flight departing today or later, or null when none are left. */
  next: GolfTripFlight | null;
  arrivalCount: number;
  returnCount: number;
}

/** For the Info tab's Flights card. `today` is "YYYY-MM-DD". */
export function flightSummary(flights: GolfTripFlight[], today: string): FlightSummary {
  const groups = groupFlights(flights);
  const next = [...flights].sort(byDeparture).find((f) => f.departureLocal.slice(0, 10) >= today) ?? null;
  return { next, arrivalCount: groups.arrival.length, returnCount: groups.return.length };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-04-22T07:05" → "Apr 22, 7:05 AM" (exactly as typed; no timezone conversion). */
export function flightTime(value: string): string {
  const match = LOCAL_TIME.exec(value);
  if (!match) return "";
  const [, , mo, d, h, mi] = match.map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[mo - 1]} ${d}, ${hour}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2 getting there · 1 heading home", or "" with none. */
export function flightCounts({ arrivalCount, returnCount }: FlightSummary): string {
  const parts = [arrivalCount && `${arrivalCount} getting there`, returnCount && `${returnCount} heading home`].filter(Boolean);
  return parts.join(" · ");
}

/** What a failed save/delete tells the person. */
export function golfTripFlightFailure(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === "P0002") return { status: 404, error: "This trip or flight couldn't be found." };
  if (error.code === "22023") return { status: 400, error: error.message?.includes("20 flights") ? `You can save up to ${MAX_FLIGHTS_PER_TRIP} flights per trip.` : "Check the flight details." };
  if (error.code === "23514" || error.code === "22007" || error.code === "22008") return { status: 400, error: "Check the flight details." };
  // Tables or functions not installed yet (supabase/golf_trip_flights.sql not run in this database).
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205") {
    return { status: 503, error: "Saving flights isn't switched on yet." };
  }
  return { status: 500, error: "We couldn't save your flight. Try again." };
}
