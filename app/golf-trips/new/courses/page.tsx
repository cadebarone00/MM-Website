import type { Metadata } from "next";
import { GolfTripCoursesStep } from "@/components/platform/GolfTripCoursesStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 4 (Courses). Fields only for now: nothing is saved to the database yet. */
export default function GolfTripCoursesPage() {
  return <SetupSheet label="Courses">
    <GolfTripCoursesStep />
  </SetupSheet>;
}
