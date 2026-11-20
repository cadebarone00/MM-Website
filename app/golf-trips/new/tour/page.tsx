import type { Metadata } from "next";
import { TourSlides } from "@/components/platform/tour/TourSlides";
import { tourDoneHref } from "@/lib/platform/tripTour";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Golf Trips tour | The Maroon" };

/**
 * The full Golf Trips tour. From Trip Builder it ends at the first question; replayed from a trip's Settings
 * (?back=/golf-trips/<id>) it goes back to that trip, and from Settings → Tutorials (?back=/settings) back to Settings.
 */
export default async function GolfTripsTourPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const { back } = await searchParams;
  return <TourSlides profileId={tripProfileId(await getCurrentProfile()) ?? "guest"} doneHref={tourDoneHref(back)} />;
}
