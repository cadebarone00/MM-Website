import "server-only";
import { setupForViewer, type TripSetupSnapshot } from "./savedTripSetup";
import { loadSavedTripTravel } from "./savedTripTravelServer";
import { loadSavedTripSetup } from "./savedTripSetupServer";
import { getGolfTrip, getImportedTrip, getMyGolfTripFlights } from "./golfTripsServer";
import { importedTripView, type ImportedTripView } from "./importedTripPresentation";
import { getScorecardCorrections, loadLiveTripScoring, loadPlayedTripRound } from "./tripScoringServer";
import { flightSummary, type GolfTripFlight } from "./golfTripFlights";
import type { SavedGolfTrip, GolfTripViewer } from "./golfTripCreate";
import type { SavedTravelSnapshot } from "./savedTripTravel";
import type { TripRoundScoring } from "./tripScoring";
import type { TripCorrections } from "./tripCorrections";
import type { ImportedEditing } from "@/components/platform/EditImportedResults";

/**
 * Everything the trip page needs, loaded once for whoever is signed in — shared by the website's trip page
 * (app/golf-trips/[tripId]/page.tsx) and the app's data route (/api/app/golf-trips/<id>), so the two can't drift apart.
 * Links (settings, flights) are left to the page, since the website and the app build them differently (golfTripUrl).
 * Plain data only, so it can be sent to the app as JSON.
 */
export type TripPageData =
  | { status: "signed-out" }
  | { status: "not-found" }
  | { status: "imported"; savedTrip: SavedGolfTrip; view: ImportedTripView; editing: Omit<ImportedEditing, "endpoint"> | null }
  | { status: "live"; savedTrip: SavedGolfTrip; viewer: GolfTripViewer; setupSnapshot: TripSetupSnapshot; planSnapshot: SavedTravelSnapshot;
      flightSummary: ReturnType<typeof flightSummary>;
      scoring: { tripId: string; profileId: string; scoring: TripRoundScoring; corrections: TripCorrections | null } | null };

/** `askedRound`: a round already played (?round=<n>, opened from Trip Settings → Corrections). */
export async function loadTripPageData(tripId: string, askedRound?: number): Promise<TripPageData> {
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return { status: view.status };

  // Imported past trip (Golf Trips → Import past trip): its results, read only. Nothing to score or plan.
  const imported = view.trip.trip.imported ? await getImportedTrip(tripId, view.viewer.profileId) : null;
  if (imported) return { status: "imported", savedTrip: view.trip, view: importedTripView(imported.trip, view.trip.members),
    editing: imported.revision > 0 ? { imported: imported.trip, revision: imported.revision, memberId: view.viewer.memberId, organizer: view.viewer.isOrganizer } : null };

  // Info tab's Flights card: your own flights (empty if flights aren't installed yet; the page never fails over them).
  const mine = await getMyGolfTripFlights(tripId);
  // Scoring: today's round, its playing groups and this golfer's saved scores (none when no round is today or
  // golf_trip_scoring.sql isn't installed yet; the page loads either way).
  const live = askedRound !== undefined && Number.isInteger(askedRound) && askedRound >= 1 ? await loadPlayedTripRound(view.trip, askedRound) : await loadLiveTripScoring(view.trip);
  // Corrections + submission history for the same round (none until golf_trip_scoring_corrections.sql is installed).
  const corrections = live.status === "ok" ? await getScorecardCorrections(live.profileId, tripId, live.scoring.roundNumber) : null;
  return {
    status: "live", savedTrip: view.trip, viewer: view.viewer,
    setupSnapshot: setupForViewer(await loadSavedTripSetup(view.trip), view.viewer.isOrganizer),
    planSnapshot: await loadSavedTripTravel(view.trip, view.viewer),
    flightSummary: flightSummary(mine.status === "ok" ? mine.flights : [], new Date().toISOString().slice(0, 10)),
    scoring: live.status === "ok" ? { tripId, profileId: live.profileId, scoring: live.scoring, corrections } : null,
  };
}

/** Trip Settings: the trip, who you are on it, and its saved setup (organizer extras only for the organizer). */
export type TripSettingsData =
  | { status: "signed-out" } | { status: "not-found" }
  | { status: "ok"; savedTrip: SavedGolfTrip; viewer: GolfTripViewer; setupSnapshot: TripSetupSnapshot };
export async function loadTripSettingsData(tripId: string): Promise<TripSettingsData> {
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return { status: view.status };
  return { status: "ok", savedTrip: view.trip, viewer: view.viewer, setupSnapshot: setupForViewer(await loadSavedTripSetup(view.trip), view.viewer.isOrganizer) };
}

/** Trip → Flights: your own flights on this trip. */
export type TripFlightsData = { status: "signed-out" } | { status: "not-found" } | { status: "ok"; flights: GolfTripFlight[]; available: boolean };
export async function loadTripFlightsData(tripId: string): Promise<TripFlightsData> {
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return { status: view.status };
  const mine = await getMyGolfTripFlights(tripId);
  return { status: "ok", flights: mine.status === "ok" ? mine.flights : [], available: mine.status === "ok" };
}
