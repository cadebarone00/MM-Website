import Link from "next/link";
import { X, ShieldUser, ShieldCheck, Monitor, GitBranch, UsersRound, BadgePercent } from "lucide-react";
import styles from "./GolfTripSettingsPreview.module.css";

const SETTINGS = [
  { title: "My Team", description: "Update your team avatar, name & player's nicknames", icon: ShieldUser },
  { title: "General", description: "Update league general settings", icon: ShieldCheck },
  { title: "Draft", description: "Update draft settings", icon: Monitor },
  { title: "Playoffs", description: "Update playoff settings", icon: GitBranch },
  { title: "Roster", description: "Update roster settings and position limits", icon: UsersRound },
  { title: "Scoring", description: "Update scoring settings", icon: BadgePercent },
];

/** Reference layout in the site's maroon palette; settings remain presentation only. */
export function GolfTripSettingsPreview() {
  return <main className={styles.page}>
    <div className={styles.content}>
      <Link href="/dev/tournament" className={styles.close} aria-label="Close settings"><X size={28} strokeWidth={3} aria-hidden /></Link>
      <header className={styles.heading}>
        <h1>The Maroon</h1>
        <p>League Settings</p>
      </header>
      <div className={styles.tabs} aria-label="Settings sections preview">
        <span className={styles.active}>GENERAL</span>
        <span>COMMISH</span>
      </div>
      <div className={styles.grid}>
        {SETTINGS.map(({ title, description, icon: Icon }) => <section key={title} className={styles.card} aria-label={title}>
          <Icon className={styles.icon} size={18} strokeWidth={2.8} aria-hidden />
          <h2>{title}</h2>
          <p>{description}</p>
        </section>)}
      </div>
    </div>
  </main>;
}
