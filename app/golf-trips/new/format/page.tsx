import type { Metadata } from "next";
import { GolfTripFormatStep } from "@/components/platform/GolfTripFormatStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 5 (Format). Fields only for now: nothing is saved to the database yet. */
export default function GolfTripFormatPage() {
  return <SetupSheet label="Format">
    <GolfTripFormatStep />
  </SetupSheet>;
}
