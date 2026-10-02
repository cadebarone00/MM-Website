import type { Metadata } from "next";
import { GolfTripSettings } from "@/components/platform/GolfTripSettings";

export const metadata: Metadata = { title: "Trip Settings | The Maroon" };

/** Trip Settings for the unsaved draft view. Nobody is signed in to a draft, so there are no organizer settings. */
export default function GolfTripDraftSettingsPage() {
  return <GolfTripSettings backHref="/golf-trips/trip" isOrganizer={false} />;
}
