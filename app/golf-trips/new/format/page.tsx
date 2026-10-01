import type { Metadata } from "next";
import { GolfTripChoiceStep } from "@/components/platform/GolfTripChoiceStep";
import { SetupSheet } from "@/components/platform/SetupSheet";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 5 (Format): will the trip include a tournament? Nothing is saved to the database yet. */
export default function GolfTripFormatPage() {
  return <SetupSheet label="Format">
    <GolfTripChoiceStep question="Will this trip include a tournament?" name="includesTournament"
      nextHref="/golf-trips/new/lodging" backHref="/golf-trips/new/courses" answers={{
        yes: <p className={styles.formatMessage}>Let&apos;s talk formats</p>,
        no: <p className={styles.formatMessage}>Time for some fun</p>,
        undecided: <p className={styles.formatMessage}>Can&apos;t decide? You can always change it</p>,
      }} />
  </SetupSheet>;
}
