import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PlayerCountSlider } from "@/components/platform/PlayerCountSlider";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { SetupStepForm } from "@/components/platform/SetupStepForm";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 2 (Players). Fields only for now: nothing is saved and Invite does nothing yet. */
export default function GolfTripPlayersPage() {
  return <SetupSheet label="Players" top={<>
    <p className={styles.creamNote}>Step 2 of 5</p>
    <h2 className={styles.creamTitle}>Players</h2>
  </>}>
    <SetupStepForm nextHref="/golf-trips/new/golf" backHref="/golf-trips/new">
      <div className={styles.fields}>
        <PlayerCountSlider />
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Your Name</span>
          <input className={styles.input} type="text" name="yourName" autoComplete="name" required />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Your Email</span>
          <input className={styles.input} type="email" name="yourEmail" autoComplete="email" required />
        </label>
        <button type="button" className={styles.invite}>
          <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
          Invite
        </button>
      </div>
    </SetupStepForm>
  </SetupSheet>;
}
