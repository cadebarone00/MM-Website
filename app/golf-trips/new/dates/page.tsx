import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { TripDatesField } from "@/components/platform/TripDatesField";
import { TripChoice } from "@/components/platform/tripBuilder/TripChoice";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

const TRAVEL = [{ value: "flying", label: "Flying" }, { value: "driving", label: "Driving" }, { value: "mix", label: "A mix" }] as const;

/** Trip Builder, step 2: the dates (required) and how the group gets there (one group answer, optional). */
export default function TripDatesPage() {
  return <SetupSheet label="When are you going?" wizardStep={TRIP_BUILDER_STEPS.indexOf("dates") + 1}>
    <SetupStepForm step="dates">
      {/* One calendar picks both: tap the first day, then the last (owner request 2026-11-02). */}
      <TripDatesField />
      <TripChoice question="How's everyone getting there?" name="travelMode" options={TRAVEL} />
    </SetupStepForm>
  </SetupSheet>;
}
