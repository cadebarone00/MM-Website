import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { TripChoice } from "@/components/platform/tripBuilder/TripChoice";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

const STRUCTURE = [
  { value: "two-teams", label: "2 Teams" }, { value: "pairs", label: "Pairs" }, { value: "individual", label: "Every player for themselves" },
] as const;

/** Trip Builder, step 3b (only when competing): the team structure. Names and picks come later in Settings. */
export default function TripTeamsPage() {
  return <SetupSheet label="How do you want to compete?" wizardStep={TRIP_BUILDER_STEPS.indexOf("teams") + 1}>
    <SetupStepForm step="teams" skip={{ teamStructure: "" }}>
      <TripChoice question="Team structure" name="teamStructure" options={STRUCTURE} required />
    </SetupStepForm>
  </SetupSheet>;
}
