"use client";
import { LearnScreen } from "@/components/platform/tour/LearnScreen";
import { useAppProfileId } from "@/lib/app/useAppProfileId";

/** App → Trip Builder → Learn about Golf Trips (per-person "seen" state uses your profile id, from the phone's login). */
export default function AppLearnGolfTrips() {
  const profileId = useAppProfileId();
  return <LearnScreen key={profileId} profileId={profileId} />;
}
