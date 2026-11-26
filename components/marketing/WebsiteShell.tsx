import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { WebsiteBrand } from "./WebsiteBrand";
import { WEBSITE_TABS } from "./websiteContent";
import styles from "./MarketingWebsite.module.css";

/**
 * Every website page's frame: Cade's maroon header (now with the tabs) and footer around the page. `active` = the
 * tab's label. Look-only website: Download is the one action, everything else is reading.
 */
export function WebsiteShell({ active, accountActions, children }: { active: string; accountActions?: ReactNode; children: ReactNode }) {
  return <div className={styles.website} id="top">
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <WebsiteBrand href="/website" />
      <nav aria-label="Website navigation">
        <span className={styles.tabs}>{WEBSITE_TABS.map((tab) => <Link key={tab.label} href={tab.href} aria-current={tab.label === active ? "page" : undefined}>{tab.label}</Link>)}</span>
        <span className={styles.navActions}>{accountActions ?? <a className={styles.navSignIn} href="/login/email?next=%2Fdashboard">Sign In</a>}<a className={styles.navDownload} href="/website#download">Download <ArrowUpRight size={15} aria-hidden="true" /></a></span>
      </nav>
    </header>
    <main id="main">{children}</main>
    <footer className={styles.footer}>
      <div className={styles.footerTop}><WebsiteBrand href="/website" /><p>Golf is better together.</p></div>
      <nav className={styles.footerLinks} aria-label="Footer destinations">
        <div><h2>The Maroon</h2><a href="/website#our-story">About The Maroon</a><Link href="/website/features">Features</Link><a href="/website#how-it-works">How It Works</a></div>
        <div><h2>Your game</h2><a href="/dashboard">Stats &amp; History</a><Link href="/tap-in">The Maroon Live</Link><a href="/website#download">iOS &amp; Android</a></div>
        <div><h2>Learn</h2><Link href="/website/tutorials">Tutorials</Link><Link href="/website/games">Game rules</Link><Link href="/website/help">Help &amp; FAQ</Link></div>
      </nav>
      <div className={styles.footerBottom}><span>&copy; {new Date().getFullYear()} The Maroon</span><a href="#top">BACK TO TOP &uarr;</a></div>
    </footer>
  </div>;
}

/** The maroon band at the top of a tab's page (the Download section's look). */
export function PageIntro({ label, title, copy }: { label: string; title: ReactNode; copy?: string }) {
  return <section className={styles.pageIntro}><p className={styles.eyebrow}>{label}</p><h1>{title}</h1>{copy && <p>{copy}</p>}</section>;
}

/** Cade's section heading (label, title, line under). */
export function SectionHeading({ label, title, copy }: { label: string; title: string; copy?: string }) {
  return <div className={styles.sectionHeading}><p className={styles.eyebrow}>{label}</p><h2>{title}</h2>{copy && <p>{copy}</p>}</div>;
}

/** The app is where things happen: the closing call on every tab. */
export function GetTheApp({ copy = "Everything here happens in the app." }: { copy?: string }) {
  return <section className={styles.download}><p className={styles.eyebrow}>READY FOR THE FIRST TEE?</p><h2>{copy}<br /><em>Get The Maroon.</em></h2><p>Coming to iOS and Android.</p><p><a className={`${styles.navDownload} ${styles.cta}`} href="/website#download">Download <ArrowUpRight size={15} aria-hidden="true" /></a></p></section>;
}
