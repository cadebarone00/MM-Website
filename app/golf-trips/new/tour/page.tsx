import type { Metadata } from "next";
import { TourSlides } from "@/components/platform/tour/TourSlides";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Golf Trips tour | The Maroon" };

/**
 * The full Golf Trips tour. From Trip Builder it ends at the first question; replayed from a trip's Settings
 * (?back=/golf-trips/<id>) it goes back to that trip. Only /golf-trips/ paths are allowed as `back`.
 */
export default async function GolfTripsTourPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const { back } = await searchParams;
  const doneHref = typeof back === "string" && /^\/golf-trips\/[A-Za-z0-9/_-]*$/.test(back) ? back : "/golf-trips/new";
  return <TourSlides profileId={tripProfileId(await getCurrentProfile()) ?? "guest"} doneHref={doneHref} />;
}
