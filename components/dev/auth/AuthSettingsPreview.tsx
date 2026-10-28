"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import frame from "./AuthNamePreview.module.css";
import styles from "./AuthSettingsPreview.module.css";

/** DEV ONLY: Authentication "Last step" settings. Public / Private profile (Private by default) and notifications.
 * Nothing is saved, and the phone's own notification permission prompt isn't shown yet. */
export function AuthSettingsPreview() {
  const router = useRouter();
  const [publicProfile, setPublicProfile] = useState(false);
  const [notifications, setNotifications] = useState(true);

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={`${frame.progress} ${styles.progress}`} aria-hidden="true"><span /></div>
    <h1 className={`${frame.title} ${styles.title}`}>Last step!</h1>
    <p className={styles.subtitle}>Choose who can see your profile and how we keep you in the loop. You can change both later in Settings.</p>
    <div className={styles.cards}>
      <Setting icon={<PersonIcon />} title="Public profile" on={publicProfile} onChange={setPublicProfile}>
        {publicProfile
          ? "Anyone on The Maroon can find you and see your profile and rounds."
          : "Off: your profile is private. Only people you play with can see it and your rounds."}
      </Setting>
      <Setting icon={<BellIcon />} title="Notifications" on={notifications} onChange={setNotifications}>
        We only notify you about your trips and rounds: tee times, live scores and results.
      </Setting>
    </div>
    <p className={styles.privacy}>We take your privacy seriously.<br /><Link href="/dev/auth/privacy">Learn more</Link></p>
    <button type="button" className={frame.continue} onClick={() => router.push("/dev/auth/all-set")}>Finish</button>
  </main>;
}

function Setting({ icon, title, on, onChange, children }: { icon: ReactNode; title: string; on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return <div className={styles.card}>
    <div className={styles.text}>
      <p className={styles.cardTitle}>{icon}{title}</p>
      <p className={styles.cardBody}>{children}</p>
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label={title} className={styles.switch} onClick={() => onChange(!on)}><span /></button>
  </div>;
}

function PersonIcon() {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function BellIcon() {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zm4 4a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}
