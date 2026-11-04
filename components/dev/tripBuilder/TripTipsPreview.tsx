"use client";

import { useState } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";
import { TIPS_SEEN_KEY, clearSeen, markSeen } from "@/lib/platform/tripTour";

/** DEV ONLY: the trip home's first-visit coach marks, as the organizer or a member (or already seen). */
export function TripTipsPreview() {
  const stage = useSimulator()?.state.tripBuilderStage ?? "tips-organizer";
  const profileId = "dev-tips-preview";
  // Every load is a "first visit" unless the Conditional says it was already seen.
  useState(() => { if (stage === "tips-seen") markSeen(TIPS_SEEN_KEY, profileId); else clearSeen(TIPS_SEEN_KEY, profileId); return 0; });
  return <GolfTripHome key={stage} preview={GOLF_TRIP_MOCK_DRAFT} previewMatch={GOLF_MATCH_PREVIEW} settingsHref="/dev/tournament/settings"
    tips={{ profileId, isOrganizer: stage !== "tips-member" }} />;
}
