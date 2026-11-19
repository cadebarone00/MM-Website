import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import styles from "./Settings.module.css";

/**
 * The Settings screen's layout (redo 2026-11-19): back to Profile, then Account, Notifications, Golf preferences,
 * Appearance, Organizer, Help & legal, and at the bottom Sign out then Delete account. A card shows only when it's given.
 * Profile things (photo, name, bio, Private profile) are in Edit profile, not here. Used by /settings and /dev/profile/settings.
 */
export function SettingsScreen({ backHref, account, notifications, golf, appearance, organizer, help, signOut, deleteAccount }: {
  backHref: string; account: ReactNode; notifications?: ReactNode; golf?: ReactNode; appearance?: ReactNode; organizer?: ReactNode;
  help?: ReactNode; signOut?: ReactNode; deleteAccount?: ReactNode;
}) {
  const card = (id: string, title: string, body: ReactNode) => body && <section aria-labelledby={`settings-${id}`} className={styles.card}>
    <h2 id={`settings-${id}`} className={styles.cardTitle}>{title}</h2>
    {body}
  </section>;
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.back} aria-label="Back to Profile"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Profile</span><h1 className="sr-only">Settings</h1>
      </header>
      {card("account", "Account", account)}
      {card("notifications", "Notifications", notifications)}
      {card("golf", "Golf preferences", golf)}
      {appearance && <section aria-labelledby="settings-appearance" className={`${styles.card} ${styles.compactCard}`}>{appearance}</section>}
      {card("organizer", "Organizer", organizer)}
      {card("help", "Help & legal", help)}
      {/* Sign out, then Delete account at the very bottom. */}
      {signOut && <div className={styles.signOut}>{signOut}</div>}
      {deleteAccount && <div className={styles.deleteRow}>{deleteAccount}</div>}
    </div>
  </main>;
}
