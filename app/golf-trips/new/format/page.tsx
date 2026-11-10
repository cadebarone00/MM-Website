import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { TripFormatsStep } from "@/components/platform/tripBuilder/TripFormatsStep";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

/** Trip Builder, step 5 (only when competing): what are you playing? */
export default function GolfTripFormatPage() {
  return <SetupSheet label="What are you playing?" wizardStep={TRIP_BUILDER_STEPS.indexOf("format") + 1}>
    <TripFormatsStep />
  </SetupSheet>;
}
