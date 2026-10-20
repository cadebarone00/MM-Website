import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { WebsiteDownloads } from "./WebsiteDownloads";
import styles from "./MarketingWebsite.module.css";

/** Adapts V1 VideoHero's full-width image/overlay composition, without season logic. */
export function WebsiteHero() {
  return <section className={styles.hero} aria-labelledby="hero-title">
    <Image src="/marketing/course-hero.jpg" alt="A golf course beside a lake, with mountains beyond the fairway" fill priority sizes="100vw" className={styles.heroImage} />
    <div className={styles.heroOverlay} />
    <div className={styles.heroCopy}>
      <p className={styles.eyebrow}>THE GAME. THE PEOPLE. THE MEMORIES.</p>
      <h1 id="hero-title">Great golf.<br />Better company.<br /><em>The Maroon.</em></h1>
      <p className={styles.intro}>For the trips you talk about all year. The rivalries that never get old. And the people who make every round worth playing.</p>
      <p className={styles.appNote}>Your next golf tradition starts here. App coming soon.</p>
      <WebsiteDownloads />
      <a href="#features" className={styles.explore}>Discover what’s ahead <ArrowDown size={16} aria-hidden="true" /></a>
    </div>
  </section>;
}
