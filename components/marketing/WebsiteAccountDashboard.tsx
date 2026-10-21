import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./WebsitePlayerDashboard.module.css";

/** Real identity only. No fixture import, statistics, scores or simulated account preferences. */
export function WebsiteAccountDashboard({ player, accountActions, websiteHref }: { player: { complete: boolean; displayName: string; username: string }; accountActions: ReactNode; websiteHref: string }) {
  return <div className={styles.dashboard}>
    <header className={styles.header}><a className={styles.brand} href={websiteHref}>The Maroon<span>FOR THE LOVE OF THE GAME</span></a>{accountActions}</header>
    <main className={styles.main} style={{ maxWidth: 1280, margin: "auto" }}>
      <section className={styles.welcome}><div><p className={styles.eyebrow}>YOUR PLAYER DASHBOARD</p><h1>{player.displayName ? `Welcome, ${player.displayName}.` : "Welcome to The Maroon."}</h1><p className={styles.intro}>{player.username ? `@${player.username}` : "Finish setting up your profile to make this space your own."}</p></div></section>
      <section className={styles.profile}><div><h2>Your profile</h2><p>{player.complete ? "Your existing Maroon account, shared with the app." : "Your account is signed in. Profile setup is still needed."}</p></div><Link href="/profile">{player.complete ? "Manage profile & account" : "Finish profile setup"} →</Link></section>
      <section className={styles.section} aria-labelledby="golf-records"><div className={styles.sectionHeading}><h2 id="golf-records">Your golf, in one place</h2></div><div className={styles.tripGrid}>
        {["Handicap & performance", "Round history", "Upcoming & past Golf Trips", "Tournament history & results"].map(title => <article key={title} className={styles.trip}><p className={styles.eyebrow}>NOT CONNECTED YET</p><h3>{title}</h3><p>Your account data will appear here when this section is connected. No sample results are shown.</p></article>)}
      </div></section>
      <footer className={styles.footer}><a href={websiteHref}>Back to website</a><Link href="/profile">Account access</Link></footer>
    </main>
  </div>;
}
