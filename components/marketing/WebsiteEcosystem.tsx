import Image from "next/image";
import { Flag, MapPin } from "lucide-react";
import styles from "./WebsiteEcosystem.module.css";

const showcaseCopy = {
  eyebrow: "ONE GAME. A BIGGER PICTURE.",
  heading: "Built for the whole experience.",
  description: "Phone for the round. Desktop for the bigger picture. Watch for the moments that matter.",
  availability: "The iPhone app is our focus. Desktop and watch experiences shown here are concepts for what could come next.",
};

/** An actual V2 capture alongside clearly identified companion concepts; no app runtime. */
export function WebsiteEcosystem() {
  return <section id="experience" className={styles.showcase} aria-labelledby="experience-title">
    <div className={styles.heading}><p className={styles.eyebrow}>{showcaseCopy.eyebrow}</p><h2 id="experience-title">{showcaseCopy.heading}</h2><p className={styles.description}>{showcaseCopy.description}</p></div>
    <div className={styles.stage}>
      <figure className={styles.laptop} aria-label="Desktop companion concept showing a golf trip overview">
        <div className={styles.laptopLid}><div className={styles.desktopScreen}>
          <div className={styles.desktopHeader}><span className={styles.wordmark}>The Maroon</span><span>TRIP COMPANION · CONCEPT</span></div>
          <div className={styles.desktopBody}>
            <div className={styles.tripHeading}><p>THE INVITATIONAL / APRIL 22–25, 2027</p><h3>A few days.<br />A year&apos;s worth of stories.</h3><span><MapPin size={12} aria-hidden="true" /> Palm Springs, California</span></div>
            <div className={styles.overview}><div className={styles.overviewTitle}><span>THE BIGGER PICTURE</span><span>01 / THE TRIP</span></div>
              <div className={styles.tripRow}><span>01</span><div><strong>Meet at the clubhouse</strong><small>Thursday · The Clubhouse Suites</small></div><span>ARRIVE</span></div>
              <div className={styles.tripRow}><span>02</span><div><strong>First tee. Familiar faces.</strong><small>Friday · Willow Pines GC</small></div><Flag size={16} aria-hidden="true" /></div>
              <div className={styles.tripRow}><span>03</span><div><strong>A little friendly competition</strong><small>Saturday · Pine Valley GC</small></div><Flag size={16} aria-hidden="true" /></div>
            </div>
          </div>
        </div></div><div className={styles.laptopBase} />
      </figure>
      <figure className={styles.phone}><div className={styles.phoneFrame}><Image src="/marketing/v2-golf-trip-home.png" alt="Actual V2 Maroon Golf Trip home screen with The Invitational trip, weather, live round and lodging." width={786} height={1704} sizes="(max-width: 600px) 220px, 286px" className={styles.phoneScreen} /></div><figcaption>THE iPHONE APP <span>IN DEVELOPMENT</span></figcaption></figure>
      <figure className={styles.watch} aria-label="Apple Watch concept: hole 10, par 4, 164 yards to the green">
        <div className={styles.watchStrap} /><div className={styles.watchCase}><div className={styles.watchScreen}><span className={styles.watchBrand}>THE MAROON</span><span className={styles.hole}>10 <small>PAR 4</small></span><strong className={styles.yards}>164<small>YARDS TO GREEN</small></strong><span className={styles.watchBottom}><Flag size={12} aria-hidden="true" /> IN THE ROUND</span></div></div><figcaption>WATCH CONCEPT</figcaption>
      </figure>
    </div>
    <div className={styles.sectionFoot}><span className={styles.edition}>THE MAROON / THE CONNECTED GAME</span><p>{showcaseCopy.availability}</p></div>
  </section>;
}
