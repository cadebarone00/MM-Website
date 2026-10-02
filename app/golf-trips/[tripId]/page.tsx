import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { golfTripUrl, savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { getTripWeather } from "@/lib/platform/weather/weatherService";
import type { TripWeather } from "@/lib/platform/weather/types";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/**
 * Golf Trip Home: the one canonical page for a saved trip, whether it was just created, refreshed, reopened
 * or picked from My Trips. Rebuilt from Supabase on every request (never from the questionnaire draft).
 * Members only: a stranger sees the same "not found" as a trip that doesn't exist.
 * `view.viewer` says whether the signed-in person is the organizer or a member, for UI that needs it.
 */
export default async function SavedGolfTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "not-found") notFound();

  // Weather from the trip's saved coordinates (cached per location), started here but NOT awaited: the page streams
  // right away and the Weather card fills in when this settles. getTripWeather never throws; the catch is a last
  // guard so the promise can never reject.
  const weather: Promise<TripWeather> = getTripWeather(view.trip.trip.latitude, view.trip.trip.longitude)
    .catch((): TripWeather => ({ status: "unavailable" }));

  // GolfTripHome reads questionnaire-shaped answers; the saved trip is passed in that shape.
  return <GolfTripHome preview={savedTripAsDraft(view.trip)} settingsHref={`${golfTripUrl(tripId)}/settings`} backHref="/golf-trips" weather={weather} />;
}
