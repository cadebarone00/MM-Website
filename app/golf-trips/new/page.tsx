import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { DestinationSearch } from "@/components/platform/DestinationSearch";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 1 (Trip Basics). Fields only for now: nothing is saved yet. */
export default function NewGolfTripPage() {
  return <SetupSheet label="Trip Basics">
    <SetupStepForm nextHref="/golf-trips/new/players" backHref="/tournaments/create/golf-trip">
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Trip Name</span>
          <input className={styles.input} type="text" name="tripName" placeholder="Maroon Masters 2027" autoComplete="off" required />
        </label>
        <DestinationSearch />
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Start Date</span>
            <input className={styles.input} type="date" name="startDate" required />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>End Date</span>
            <input className={styles.input} type="date" name="endDate" required />
          </label>
        </div>
      </div>
    </SetupStepForm>
  </SetupSheet>;
}
