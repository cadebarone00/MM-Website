import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevTourneyPreview } from "@/components/dev/DevTourneyPreview";

export const metadata: Metadata = { title: "Tournament preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: a sample tournament (no sign-in, nothing saved). The simulator's Tourneys conditions pick the view. */
export default function DevTourneyPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevTourneyPreview />;
}
