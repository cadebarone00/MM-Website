import { Link2 } from "lucide-react";
import styles from "./CreateTournament.module.css";

/**
 * The Yes answer on Lodging / Flights / Transportation: buttons to connect a booking account. Not wired up yet
 * (provider connections come in a later phase), so the buttons do nothing for now.
 */
export function ConnectAccounts({ note, providers }: { note: string; providers: readonly string[] }) {
  return <div className={styles.connect}>
    <p className={styles.sectionNote}>{note}</p>
    <div className={styles.connectGrid}>
      {providers.map((provider) => <button key={provider} type="button" className={styles.connectButton} aria-label={`Connect ${provider}`}>
        <Link2 size={16} strokeWidth={2.25} aria-hidden="true" />
        {provider}
      </button>)}
    </div>
  </div>;
}
