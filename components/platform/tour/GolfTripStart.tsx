"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TOUR_SEEN_KEY, hasSeen } from "@/lib/platform/tripTour";

/** Where Create a Golf Trip lands: Learn about Golf Trips the first time, the first question once it's been seen. */
export function golfTripStartPath(profileId: string): string {
  return hasSeen(TOUR_SEEN_KEY, profileId) ? "/golf-trips/new" : "/golf-trips/new/learn";
}

/**
 * Create a Golf Trip (owner request 2026-11-20): no setup screen, it goes straight on. Learn shows the first time; once
 * it's skipped or the tour is finished, Create opens the first question. `profileId` null = still finding out who's
 * signed in (the app), so wait. Shows a blank maroon page for that moment.
 */
export function GolfTripStart({ profileId }: { profileId: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (profileId !== null) router.replace(golfTripStartPath(profileId));
  }, [profileId, router]);
  return <main style={{ minHeight: "100svh", background: "var(--lm-bg-240001)" }} aria-busy="true" />;
}
