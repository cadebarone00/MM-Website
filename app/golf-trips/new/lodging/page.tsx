import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { TripLodgingStep } from "@/components/platform/tripBuilder/TripLodgingStep";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

/** Trip Builder, last step: where are you staying? Then Create Trip. */
export default function GolfTripLodgingPage() {
  return <SetupSheet label="Where are you staying?" wizardStep={TRIP_BUILDER_STEPS.indexOf("lodging") + 1}>
    <TripLodgingStep />
  </SetupSheet>;
}
