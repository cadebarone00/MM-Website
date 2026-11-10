import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { PlayerCountSlider } from "@/components/platform/PlayerCountSlider";
import { TripChoice } from "@/components/platform/tripBuilder/TripChoice";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

const COMPETING = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] as const;

/** Trip Builder, step 3: how many are going, and are you all competing? Yes opens the competition setup. */
export default function TripPlayersPage() {
  return <SetupSheet label="Who's coming?" wizardStep={TRIP_BUILDER_STEPS.indexOf("players") + 1}>
    <SetupStepForm step="players" skip={{ competing: "" }}>
      <PlayerCountSlider />
      <TripChoice question="Are you all competing?" name="competing" options={COMPETING} required />
    </SetupStepForm>
  </SetupSheet>;
}
