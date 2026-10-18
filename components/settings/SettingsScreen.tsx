import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import styles from "./Settings.module.css";

/**
 * The Settings screen's layout: back to Profile, then the Profile photo, Account and Privacy cards and Sign Out at the
 * bottom (plus Organizer requests when there are any). Each card shows only when it's given. Used by /settings and the dev profile preview (/dev/profile/settings).
 */
export function SettingsScreen({ backHref, photo, account, offers, privacy, signOut }: { backHref: string; photo?: ReactNode; account: ReactNode; offers?: ReactNode; privacy?: ReactNode; signOut?: ReactNode }) {
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.back} aria-label="Back to Profile"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Profile</span><h1 className="sr-only">Settings</h1>
      </header>

      {photo && <section aria-labelledby="settings-photo" className={styles.card}>
        <h2 id="settings-photo" className={styles.cardTitle}>Profile photo</h2>
        {photo}
      </section>}

      <section aria-labelledby="settings-account" className={styles.card}>
        <h2 id="settings-account" className={styles.cardTitle}>Account</h2>
        {account}
      </section>

      {/* Only when another organizer asked this person to take over a trip (account deletion hand-off). */}
      {offers && <section aria-labelledby="settings-offers" className={styles.card}>
        {offers}
      </section>}

      {privacy && <section aria-labelledby="settings-privacy" className={`${styles.card} ${styles.compactCard}`}>
        {privacy}
      </section>}

      {/* Sign Out sits at the very bottom, on its own. */}
      {signOut && <div className={styles.signOut}>{signOut}</div>}
    </div>
  </main>;
}
