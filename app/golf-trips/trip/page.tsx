import type { Metadata } from "next";
import { GolfTripHome } from "@/components/platform/GolfTripHome";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/** Golf Trip Home: where the organizer lands after the questionnaire. Layout only; it shows this tab's draft answers. */
export default function GolfTripHomePage() {
  return <GolfTripHome />;
}
