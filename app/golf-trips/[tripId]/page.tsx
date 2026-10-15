import { setupForViewer } from "@/lib/platform/savedTripSetup";
import { loadSavedTripTravel } from "@/lib/platform/savedTripTravelServer";
import { loadSavedTripSetup } from "@/lib/platform/savedTripSetupServer";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SavedGolfTripHome } from "@/components/platform/SavedGolfTripHome";
import { golfTripUrl, savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import { getGolfTrip, getMyGolfTripFlights } from "@/lib/platform/golfTripsServer";
import { getScorecardCorrections, loadLiveTripScoring, loadPlayedTripRound } from "@/lib/platform/tripScoringServer";
import { flightSummary } from "@/lib/platform/golfTripFlights";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/**
 * Golf Trip Home: the one canonical page for a saved trip, whether it was just created, refreshed, reopened
 * or picked from My Trips. Rebuilt from Supabase on every request (never from the questionnaire draft).
 * Members only: a stranger sees the same "not found" as a trip that doesn't exist.
 * `view.viewer` says whether the signed-in person is the organizer or a member, for UI that needs it.
 */
export default async function SavedGolfTripPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ round?: string }> }) {
  const { tripId } = await params;
  // ?round=<n>: a round already played (opened from Trip Settings → Corrections), read-only unless a correction reopens it.
  const askedRound = Number((await searchParams).round);
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "not-found") notFound();

  // Weather is turned off: the app will use the phone's own weather (e.g. Apple Weather on iOS) instead of the
  // National Weather Service. Without a `weather` prop, Home shows no Weather card and no quick weather.
  // The weather code in lib/platform/weather is kept, just not called.

  // Info tab's Flights card: your own flights (empty if flights aren't installed yet; the page never fails over them).
  const mine = await getMyGolfTripFlights(tripId);
  const flights = { summary: flightSummary(mine.status === "ok" ? mine.flights : [], new Date().toISOString().slice(0, 10)), href: `${golfTripUrl(tripId)}/flights` };

  // Scoring: today's round, its playing groups and this golfer's saved scores (none when no round is today or
  // golf_trip_scoring.sql isn't installed yet; the page loads either way).
  const live = Number.isInteger(askedRound) && askedRound >= 1 ? await loadPlayedTripRound(view.trip, askedRound) : await loadLiveTripScoring(view.trip);
  // Corrections + submission history for the same round (none until golf_trip_scoring_corrections.sql is installed).
  const corrections = live.status === "ok" ? await getScorecardCorrections(live.profileId, tripId, live.scoring.roundNumber) : null;
  const scoring = live.status === "ok" ? { tripId, profileId: live.profileId, scoring: live.scoring, corrections } : undefined;

  // GolfTripHome reads questionnaire-shaped answers; the saved trip is passed in that shape.
  return <SavedGolfTripHome planSnapshot={await loadSavedTripTravel(view.trip, view.viewer)} setupSnapshot={setupForViewer(await loadSavedTripSetup(view.trip), view.viewer.isOrganizer)} savedTrip={view.trip} preview={savedTripAsDraft(view.trip)} settingsHref={`${golfTripUrl(tripId)}/settings`} backHref="/golf-trips" alertScope={{ tripId, profileId: view.viewer.profileId, isOrganizer: view.viewer.isOrganizer }} flights={flights} scoring={scoring} />;
}
