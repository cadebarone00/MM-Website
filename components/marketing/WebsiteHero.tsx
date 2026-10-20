import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { WebsiteDownloads } from "./WebsiteDownloads";
import styles from "./MarketingWebsite.module.css";

const heroCopy = {
  eyebrow: "THE GAME. THE PEOPLE. THE MEMORIES.",
  headline: "Great golf.",
  headlineAccent: "Better company.",
  description: "Your trips. Your people. Your competition. All in one place.",
  availability: "Your next golf tradition starts here. App coming soon.",
};

/** Adapts V1 VideoHero's full-width image/overlay composition, without season logic. */
export function WebsiteHero() {
  return <section className={styles.hero} aria-labelledby="hero-title">
    <Image src="/marketing/course-hero.jpg" alt="A golf course beside a lake, with mountains beyond the fairway" fill priority sizes="100vw" className={styles.heroImage} />
    <div className={styles.heroOverlay} />
    <div className={styles.heroCopy}>
      <p className={styles.eyebrow}>{heroCopy.eyebrow}</p>
      <h1 id="hero-title">{heroCopy.headline}<br /><em>{heroCopy.headlineAccent}</em></h1>
      <p className={styles.intro}>{heroCopy.description}</p>
      <p className={styles.appNote}>{heroCopy.availability}</p>
      <WebsiteDownloads />
      <a href="#features" className={styles.explore}>Discover what’s ahead <ArrowDown size={16} aria-hidden="true" /></a>
    </div>
    <figure className={styles.heroProduct}>
      <div className={styles.heroPhone}>
        <Image src="/marketing/v2-golf-trip-home.png" alt="The Maroon app showing The Invitational golf trip: Palm Springs dates, weather, live round and lodging cards." width={786} height={1704} sizes="(max-width: 760px) 270px, (max-width: 1100px) 300px, 326px" className={styles.heroScreen} />
      </div>
      <figcaption className={styles.heroProductCaption}>YOUR TRIP. ALWAYS WITH YOU.</figcaption>
    </figure>
  </section>;
}
