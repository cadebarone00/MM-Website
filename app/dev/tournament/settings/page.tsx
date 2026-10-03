import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsDataPreview } from "./SettingsDataPreview";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft } from "@/lib/platform/tournamentToGolfTrip";

import { GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";

export const metadata: Metadata = { title: "Trip Settings preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the screenshot-inspired static Settings layout.
 * No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 */
export default function GolfTripSettingsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SettingsDataPreview mock={{ preview: GOLF_TRIP_MOCK_DRAFT }} maroon={{ preview: adaptTournamentToDraft(palmSprings2026).draft }} />;
}
