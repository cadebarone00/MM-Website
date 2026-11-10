import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { DestinationSearch } from "@/components/platform/DestinationSearch";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Trip Builder | The Maroon" };

/** Trip Builder, step 1: the trip's name and where it is. Both required. You (the signed-in profile) are the organizer. */
export default function NewGolfTripPage() {
  return <SetupSheet label="What's the trip?" wizardStep={TRIP_BUILDER_STEPS.indexOf("basics") + 1}>
    <SetupStepForm step="basics">
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Trip Name</span>
          <input className={styles.input} type="text" name="tripName" placeholder="Maroon Masters 2027" autoComplete="off" required />
        </label>
        <DestinationSearch />
      </div>
    </SetupStepForm>
  </SetupSheet>;
}
