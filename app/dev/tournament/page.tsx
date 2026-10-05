import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentDataPreview } from "./TournamentDataPreview";
import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, GOLF_TRIP_MOCK_DRAFT, GOLF_TRIP_MOCK_ITINERARY, GOLF_TRIP_PREVIEW_FLIGHTS } from "@/lib/platform/golfTripPreviewFixture";
import { flightSummary } from "@/lib/platform/golfTripFlights";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft, adaptTournamentToPreviewMatch } from "@/lib/platform/tournamentToGolfTrip";

export const metadata: Metadata = { title: "Golf Trip preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of Golf Trip Home (/golf-trips/trip) as if the questionnaire were finished, using
 * fixture answers. No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 * Accepts ?format=singles | fourball | foursome | bestball | scramble | shamble | chapman | stableford | singlesstroke | custom to preview format templates.
 */
export default async function GolfTripPreviewPage({ searchParams }: { searchParams?: Promise<{ format?: string; simulator?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const formatKey = (params?.format ?? "singles").toLowerCase();
  // Prefer a tournament-derived preview when possible so the Golf tab shows real matches/leaderboard;
  // fall back to the format fixtures where the tournament is missing match/leaderboard data.
  const tournamentPreview = adaptTournamentToPreviewMatch(palmSprings2026);
  const previewMatch = (tournamentPreview && tournamentPreview.leaderboard && tournamentPreview.matches && tournamentPreview.matches.length > 0)
    ? tournamentPreview
    : (GOLF_MATCH_PREVIEWS[formatKey] ?? GOLF_MATCH_PREVIEW);

  // Adapt the real Maroon tournament into the draft the GolfTripHome expects so the UI
  // shows real tournament data wherever available. The adapter also returns unmapped
  // fields for a small dev inspector below.
  const { draft, unmapped } = adaptTournamentToDraft(palmSprings2026);

  const flights = { summary: flightSummary(GOLF_TRIP_PREVIEW_FLIGHTS, "2027-04-01"), href: null };
  return <TournamentDataPreview
    embedded={params?.simulator === "1"}
    mock={{ preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEWS[formatKey] ?? GOLF_MATCH_PREVIEW, flights, itinerary: GOLF_TRIP_MOCK_ITINERARY }} // only the mock trip has an itinerary
    maroon={{ preview: { ...draft, destinationLatitude: "33.8303", destinationLongitude: "-116.5453" }, previewMatch, flights }} // Palm Springs pin for the Venue map
    unmapped={unmapped}
  />;
}
