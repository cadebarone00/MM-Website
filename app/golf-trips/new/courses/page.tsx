import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { GolfTripCoursesStep } from "@/components/platform/GolfTripCoursesStep";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

/** Trip Builder, step 4b: a course for each round. Skippable (courses are set later in Settings). */
export default function GolfTripCoursesPage() {
  return <SetupSheet label="Pick your courses" wizardStep={TRIP_BUILDER_STEPS.indexOf("courses") + 1}>
    <GolfTripCoursesStep />
  </SetupSheet>;
}
