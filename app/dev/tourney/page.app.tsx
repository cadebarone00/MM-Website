"use client";

import { DevTourneyPreview } from "@/components/dev/DevTourneyPreview";

/** App → the sample tournament (dev server only); the website's /dev/tourney, as the player view. */
export default function DevTourneyAppPage() {
  return process.env.NODE_ENV === "development" ? <DevTourneyPreview /> : null;
}
