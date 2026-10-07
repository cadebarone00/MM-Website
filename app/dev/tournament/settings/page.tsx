import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsDataPreview } from "./SettingsDataPreview";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft, adaptTournamentToPreviewMatch } from "@/lib/platform/tournamentToGolfTrip";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT, GOLF_TRIP_MOCK_TRAVEL } from "@/lib/platform/golfTripPreviewFixture";

export const metadata: Metadata = { title: "Trip Settings preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the screenshot-inspired static Settings layout.
 * No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 */
export default function GolfTripSettingsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  // Same trips as the trip page (/dev/tournament), so Settings matches everything else.
  return <SettingsDataPreview mock={{ preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW, travel: GOLF_TRIP_MOCK_TRAVEL }}
    maroon={{ preview: adaptTournamentToDraft(palmSprings2026).draft, previewMatch: adaptTournamentToPreviewMatch(palmSprings2026) }} />;
}
