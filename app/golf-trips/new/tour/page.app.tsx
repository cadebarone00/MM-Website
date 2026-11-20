"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TourSlides } from "@/components/platform/tour/TourSlides";
import { useAppProfileId } from "@/lib/app/useAppProfileId";
import { tourDoneHref } from "@/lib/platform/tripTour";

/** App → Golf Trips tour. `?back=` returns to a Golf Trips page or Settings (the same check as the website). */
function AppTour() {
  const back = useSearchParams().get("back");
  const profileId = useAppProfileId();
  return <TourSlides key={profileId} profileId={profileId} doneHref={tourDoneHref(back)} />;
}

export default function AppTourPage() {
  return <Suspense><AppTour /></Suspense>;
}
