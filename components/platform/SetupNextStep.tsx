import Link from "next/link";
import { SetupSheet } from "./SetupSheet";
import { GetStartedButton } from "./tour/GetStartedButton";
import type { SetupType } from "@/lib/platform/setupTypes";
import styles from "./CreateTournament.module.css";

/** Create → a type: Golf Trip shows Welcome to Golf Trips → Get Started (the Learn screen the first time); other types
 *  are coming soon. Shared by the website's page and the iPhone / Android app's. */
export function SetupNextStep({ type, profileId }: { type: SetupType; profileId: string }) {
  const isGolfTrip = type.key === "golf-trip";
  return <SetupSheet label={isGolfTrip ? "Welcome to Golf Trips" : `${type.name} setup`} wizardStep={isGolfTrip ? 0 : undefined} top={<h2 className={styles.creamTitle}>{type.name} setup</h2>}>
    {isGolfTrip
      ? <GetStartedButton key={profileId} profileId={profileId} className={`${styles.continue} ${styles.start}`} />
      : <p className={styles.sheetNote}>The next step is coming soon</p>}
    <Link href={isGolfTrip ? "/golf-trips" : "/tournaments/join"} className={styles.back}>Back</Link>
  </SetupSheet>;
}
