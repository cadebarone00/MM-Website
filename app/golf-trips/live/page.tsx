import type { Metadata } from "next";
import { MaroonLiveDirectory } from "@/components/tap-in/MaroonLiveDirectory";

export const metadata: Metadata = { title: "The Maroon Live | Golf Trips", robots: { index: false, follow: false } };

export default function GolfTripsLivePage() {
  return <MaroonLiveDirectory surface="app" />;
}
