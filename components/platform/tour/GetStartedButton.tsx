"use client";

import { useRouter } from "next/navigation";
import { TOUR_SEEN_KEY, hasSeen } from "@/lib/platform/tripTour";

/** Welcome to Golf Trips → Get Started: the Learn screen the first time, straight to the first question after that. */
export function GetStartedButton({ profileId, className }: { profileId: string; className?: string }) {
  const router = useRouter();
  return <button type="button" className={className}
    onClick={() => router.push(hasSeen(TOUR_SEEN_KEY, profileId) ? "/golf-trips/new" : "/golf-trips/new/learn")}>Get Started</button>;
}
