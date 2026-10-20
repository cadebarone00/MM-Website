import { ArrowUpRight, Flag, MapPin, Medal, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { WebsiteBrand } from "./WebsiteBrand";
import { WebsiteDownloads } from "./WebsiteDownloads";
import { WebsiteEcosystem } from "./WebsiteEcosystem";
import { WebsiteHero } from "./WebsiteHero";
import styles from "./MarketingWebsite.module.css";

const features = [
  { icon: MapPin, title: "Golf Trips", copy: "The next great weekend starts with a plan. Bring the rounds, the crew, and the details together." },
  { icon: Trophy, title: "Tournaments", copy: "Give your annual tradition a proper home. A little organization. A lot to play for." },
  { icon: Flag, title: "Live Scoring", copy: "Follow the round as it unfolds. Every birdie, every comeback, every last putt." },
  { icon: Medal, title: "Competition", copy: "Friendly rivalries deserve more than a group chat. Make every matchup mean something." },
  { icon: MapPin, title: "GPS", copy: "Find your way around the course, with a clearer picture of the hole ahead." },
  { icon: Users, title: "Profiles", copy: "A place for your golf identity, your playing partners, and the rounds you remember." },
];

function SectionHeading({ label, title, copy }: { label: string; title: string; copy?: string }) {
  return <div className={styles.sectionHeading}><p className={styles.eyebrow}>{label}</p><h2>{title}</h2>{copy && <p>{copy}</p>}</div>;
}

export function MarketingWebsite({ accountActions }: { accountActions?: ReactNode }) {
  return <div className={styles.website} id="top">
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <WebsiteBrand />
      <nav aria-label="Website navigation"><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#our-story">Our Story</a><a href="#support">Support</a><span className={styles.navActions}>{accountActions ?? <a className={styles.navSignIn} href="/login/email?next=%2Fdashboard">Sign In</a>}<a className={styles.navDownload} href="#download">Download <ArrowUpRight size={15} aria-hidden="true" /></a></span></nav>
    </header>
    <main id="main">
      <WebsiteHero />
      <div className={styles.ribbon}><span>BUILT AROUND YOUR CREW.</span><span>FROM THE FIRST TEE TO THE LAST STORY.</span><span>THIS IS YOUR GAME.</span></div>
      <section id="features" className={styles.section}><SectionHeading label="ALL TOGETHER. ALL IN ONE PLACE." title="Less planning. More playing." copy="A look at the experience we’re building for your golf life." /><div className={styles.featureGrid}>{features.map(({ icon: Icon, title, copy }, i) => <article className={styles.feature} key={title}><div className={styles.featureTop}><Icon size={26} strokeWidth={1.3} aria-hidden="true" /><span>0{i + 1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <WebsiteEcosystem />
      <section id="how-it-works" className={styles.how}><SectionHeading label="FROM AN IDEA TO A TRADITION" title="Your crew. Your kind of golf." /><div className={styles.steps}>{[["Create", "Start with a trip, a tournament, or a reason to get out there."], ["Invite", "Bring your people. Old playing partners and new rivalries welcome."], ["Play", "Put the plans into play. Let the course take care of the rest."], ["Remember", "Keep the stories going, long after the final handshake."]].map(([title, copy], i) => <article key={title}><span className={styles.stepNumber}>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section id="our-story" className={`${styles.section} ${styles.story}`}><div className={styles.storyMark} aria-hidden="true"><span>M</span><p>MORE THAN<br />A ROUND.</p></div><div><p className={styles.eyebrow}>OUR STORY</p><h2>Some things start<br />with a tee time.</h2><p>We believe the best part of golf is who you share it with. The early starts. The friendly pressure. The stories that get a little better every year.</p><p>The story behind The Maroon is coming soon. This is where we’ll share how it all began, and where we’re headed next.</p><span className={styles.storySign}>Here’s to the next round.</span></div></section>
      <section id="support" className={styles.section}><SectionHeading label="SUPPORT" title="Here for the next round." copy="Support details will be available when The Maroon launches." /></section>
      <section id="download" className={styles.download}><p className={styles.eyebrow}>THE NEXT CHAPTER IS COMING</p><h2>Keep your crew close.<br /><em>Your next round closer.</em></h2><p>The Maroon is coming to iOS and Android.<br />We’ll meet you at the first tee.</p><WebsiteDownloads /></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><WebsiteBrand /><p>Golf is better together.</p></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} The Maroon</span><nav aria-label="Footer information"><a href="/dev-website?view=dashboard">Player Dashboard</a><a href="#support">Support</a>{["Legal", "Privacy", "Instagram"].map(label => <span key={label}>{label} <small>Coming soon</small></span>)}</nav><a href="#top">BACK TO TOP ↑</a></div></footer>
  </div>;
}
