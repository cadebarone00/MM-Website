import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripTipsPreview } from "@/components/dev/tripBuilder/TripTipsPreview";

export const metadata: Metadata = { title: "Trip tips preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Trip Builder coach marks on the trip home. */
export default function DevTripTipsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TripTipsPreview />;
}
