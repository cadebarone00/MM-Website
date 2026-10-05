import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfGpsScreen } from "@/components/platform/gps/GolfGpsScreen";

export const metadata: Metadata = { title: "GPS prototype | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the on-course GPS (Mission Hills Pete Dye, hole 6 from OpenStreetMap). Real / Mock GPS test controls are in the /dev simulator panel.
 * 404 unless NODE_ENV=development (`npm run dev`). The same screen opens from the Scoring sheet's GPS pill.
 */
export default function GolfGpsPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main style={{ height: "100svh", background: "#240001" }}>
    <GolfGpsScreen />
  </main>;
}
