import type { Metadata } from "next";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import { DestinationSearch } from "@/components/platform/DestinationSearch";
import { PlayerCountSlider } from "@/components/platform/PlayerCountSlider";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 1 (Trip Basics): name, destination, dates and how many are going. You (the signed-in profile) are the organizer. */
export default function NewGolfTripPage() {
  return <SetupSheet label="Trip Basics" tall>
    <SetupStepForm nextHref="/golf-trips/new/golf" backHref="/tournaments/create/golf-trip">
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
        <PlayerCountSlider />
      </div>
    </SetupStepForm>
  </SetupSheet>;
}
