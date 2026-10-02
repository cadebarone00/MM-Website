import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, GOLF_TRIP_PREVIEW_DRAFT, GOLF_TRIP_PREVIEW_FLIGHTS } from "@/lib/platform/golfTripPreviewFixture";
import { flightSummary } from "@/lib/platform/golfTripFlights";

export const metadata: Metadata = { title: "Golf Trip preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of Golf Trip Home (/golf-trips/trip) as if the questionnaire were finished, using
 * fixture answers. No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 * Accepts ?format=singles | fourball | foursome | bestball | scramble | shamble | chapman | stableford | singlesstroke | custom to preview format templates.
 */
export default async function GolfTripPreviewPage({ searchParams }: { searchParams?: Promise<{ format?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const formatKey = (params?.format ?? "singles").toLowerCase();
  const previewMatch = GOLF_MATCH_PREVIEWS[formatKey] ?? GOLF_MATCH_PREVIEW;

  return <GolfTripHome preview={GOLF_TRIP_PREVIEW_DRAFT} settingsHref="/dev/tournament/settings" backHref="/golf-trips" previewMatch={previewMatch}
    flights={{ summary: flightSummary(GOLF_TRIP_PREVIEW_FLIGHTS, "2027-04-01"), href: null }} />;
}
