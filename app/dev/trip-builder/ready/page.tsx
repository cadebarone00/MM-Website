import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripReadyPreview } from "@/components/dev/tripBuilder/TripReadyPreview";

export const metadata: Metadata = { title: "Trip ready preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Trip Builder → Your trip is ready → Invite your crew. */
export default function DevTripReadyPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TripReadyPreview />;
}
