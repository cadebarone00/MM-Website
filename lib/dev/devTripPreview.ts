import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, GOLF_TRIP_MOCK_DRAFT, GOLF_TRIP_MOCK_TRAVEL, GOLF_TRIP_PREVIEW_FLIGHTS } from "@/lib/platform/golfTripPreviewFixture";
import { flightSummary } from "@/lib/platform/golfTripFlights";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { scorecards2026 } from "@/lib/data/scorecards-2026";
import { historicalTripStandings } from "@/lib/platform/historicalTripStandings";
import { adaptTournamentToDraft, adaptTournamentToPreviewMatch, tournamentSessions } from "@/lib/platform/tournamentToGolfTrip";

/**
 * DEV ONLY: the example trips the Golf Trip preview shows (/dev/tournament on the website, and the same in the app on
 * `npm run dev:app`): the mock trip, and the real 2026 Palm Springs Maroon trip as a Golf Trip. Sample data only —
 * no login, no database — so the website's page and the app's page build exactly the same thing.
 * `formatKey` (?format=…): singles | fourball | foursome | bestball | scramble | shamble | chapman | stableford | singlesstroke | custom.
 */
export function devTripPreview(formatKey = "singles") {
  // Prefer a tournament-derived preview when possible so the Golf tab shows real matches/leaderboard;
  // fall back to the format fixtures where the tournament is missing match/leaderboard data.
  const tournamentPreview = adaptTournamentToPreviewMatch(palmSprings2026);
  const sessions = tournamentSessions(palmSprings2026);
  const snapshots = historicalTripStandings(palmSprings2026, scorecards2026, sessions);
  const latest = snapshots.at(-1);
  if (latest) {
    tournamentPreview.roundStandings = snapshots;
    tournamentPreview.round = latest.round;
    tournamentPreview.roundDate = sessions.at(-1)?.date ?? tournamentPreview.roundDate;
    tournamentPreview.format = sessions.at(-1)?.format ?? tournamentPreview.format;
    tournamentPreview.formatDef = undefined;
    tournamentPreview.leaderboard = latest.leaderboard;
    tournamentPreview.par = latest.par ?? tournamentPreview.par;
  }
  const previewMatch = (tournamentPreview && tournamentPreview.leaderboard && tournamentPreview.matches && tournamentPreview.matches.length > 0)
    ? tournamentPreview
    : (GOLF_MATCH_PREVIEWS[formatKey] ?? GOLF_MATCH_PREVIEW);
  // Adapt the real Maroon tournament into the draft the GolfTripHome expects so the UI shows real tournament data
  // wherever available. The adapter also returns unmapped fields for a small dev inspector.
  const { draft, unmapped } = adaptTournamentToDraft(palmSprings2026);
  const flights = { summary: flightSummary(GOLF_TRIP_PREVIEW_FLIGHTS, "2027-04-01"), href: null };
  return {
    mock: { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEWS[formatKey] ?? GOLF_MATCH_PREVIEW, flights, travel: GOLF_TRIP_MOCK_TRAVEL }, // only the mock trip has travel (My Info / Itinerary)
    maroon: { preview: { ...draft, destinationLatitude: "33.8303", destinationLongitude: "-116.5453" }, previewMatch, flights }, // Palm Springs pin for the Venue map
    unmapped,
  };
}

/** The same trips for the Trip Settings preview (/dev/tournament/settings). */
export function devTripSettingsPreview() {
  return {
    mock: { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW, travel: GOLF_TRIP_MOCK_TRAVEL },
    maroon: { preview: adaptTournamentToDraft(palmSprings2026).draft, previewMatch: adaptTournamentToPreviewMatch(palmSprings2026) },
  };
}
