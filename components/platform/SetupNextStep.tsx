import Link from "next/link";
import { SetupSheet } from "./SetupSheet";
import type { SetupType } from "@/lib/platform/setupTypes";
import styles from "./CreateTournament.module.css";

/** Create → a type that isn't built yet: coming soon. (Golf Trip skips this screen: see tour/GolfTripStart.) Shared by
 *  the website's page and the iPhone / Android app's. */
export function SetupNextStep({ type }: { type: SetupType }) {
  return <SetupSheet label={`${type.name} setup`} top={<h2 className={styles.creamTitle}>{type.name} setup</h2>}>
    <p className={styles.sheetNote}>The next step is coming soon</p>
    <Link href="/tournaments/join" className={styles.back}>Back</Link>
  </SetupSheet>;
}
