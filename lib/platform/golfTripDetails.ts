import { destinationPlace, type GolfTripFieldError, type PlanAnswer } from "./golfTripCreate.ts";

/**
 * Trip Settings → General → General Settings: the trip's own details (name, destination, how everyone's getting there),
 * changed by the organizer after the trip is made. Saved by update_golf_trip_details (supabase/golf_trip_details.sql)
 * through PATCH /api/golf-trips/<id>/details. Same limits as Trip Builder (golfTripCreate.ts).
 */
export type TravelMode = "flying" | "driving" | "mix";

export interface GolfTripDetails {
  name: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  externalPlaceId: string | null;
  /** Travel as the trip's flight plan answer (Trip Builder: Flying = yes, Driving = no, A mix = undecided). */
  flightPlan: PlanAnswer;
}

export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: "flying", label: "Flying" }, { value: "driving", label: "Driving" }, { value: "mix", label: "A mix" },
];

export function travelFromFlightPlan(plan: PlanAnswer): TravelMode {
  return plan === "yes" ? "flying" : plan === "no" ? "driving" : "mix";
}

export function flightPlanFromTravel(mode: TravelMode): PlanAnswer {
  return mode === "flying" ? "yes" : mode === "driving" ? "no" : "undecided";
}

/** Checks a details change: { tripName, destination, destinationPlaceId?, destinationLatitude?, destinationLongitude?, travelMode }. */
export function golfTripDetailsFromBody(body: unknown):
  { ok: true; details: GolfTripDetails } | { ok: false; errors: GolfTripFieldError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: [{ field: "body", message: "Invalid request." }] };
  const fields = body as Record<string, unknown>;
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string).trim() : "");
  const errors: GolfTripFieldError[] = [];

  const name = text("tripName");
  if (!name) errors.push({ field: "tripName", message: "Add a trip name." });
  else if (name.length > 120) errors.push({ field: "tripName", message: "Keep the trip name under 120 characters." });

  const destination = text("destination");
  if (!destination) errors.push({ field: "destination", message: "Add a destination." });
  else if (destination.length > 200) errors.push({ field: "destination", message: "Keep the destination under 200 characters." });

  const travel = text("travelMode") as TravelMode;
  if (!TRAVEL_MODES.some(mode => mode.value === travel)) errors.push({ field: "travelMode", message: "Pick how everyone's getting there." });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    details: {
      name, destination, ...destinationPlace(text("destinationPlaceId"), text("destinationLatitude"), text("destinationLongitude")),
      flightPlan: flightPlanFromTravel(travel),
    },
  };
}
