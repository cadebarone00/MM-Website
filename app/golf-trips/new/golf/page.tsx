import type { Metadata } from "next";
import { GolfTripGolfStep } from "@/components/platform/GolfTripGolfStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 3 (Golf). Fields only for now: nothing is saved to the database yet. */
export default function GolfTripGolfPage() {
  return <SetupSheet label="Golf">
    <GolfTripGolfStep />
  </SetupSheet>;
}
