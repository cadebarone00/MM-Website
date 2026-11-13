"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TourSlides } from "@/components/platform/tour/TourSlides";
import { useAppProfileId } from "@/lib/app/useAppProfileId";

/** App → Golf Trips tour. `?back=` returns to a Golf Trips page (the same check as the website). */
function AppTour() {
  const back = useSearchParams().get("back");
  const profileId = useAppProfileId();
  const doneHref = back && /^\/golf-trips\/[A-Za-z0-9/_-]*$/.test(back) ? back : "/golf-trips/new";
  return <TourSlides key={profileId} profileId={profileId} doneHref={doneHref} />;
}

export default function AppTourPage() {
  return <Suspense><AppTour /></Suspense>;
}
