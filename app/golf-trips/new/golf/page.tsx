import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { GolfTripGolfStep } from "@/components/platform/GolfTripGolfStep";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

/** Trip Builder, step 4: where are you playing — golf days and 1 or 2 rounds each. Skippable (no rounds yet). */
export default function GolfTripGolfPage() {
  return <SetupSheet label="Where are you playing?" wizardStep={TRIP_BUILDER_STEPS.indexOf("golf") + 1}>
    <GolfTripGolfStep />
  </SetupSheet>;
}
