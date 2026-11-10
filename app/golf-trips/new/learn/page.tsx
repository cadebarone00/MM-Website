import type { Metadata } from "next";
import { LearnScreen } from "@/components/platform/tour/LearnScreen";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Learn about Golf Trips | The Maroon" };

/** Trip Builder's first-time Learn screen: 3 quick swipes, then Learn about Golf Trips or Skip for now. */
export default async function LearnGolfTripsPage() {
  return <LearnScreen profileId={tripProfileId(await getCurrentProfile()) ?? "guest"} />;
}
