"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Flag, Plus } from "lucide-react";
import { maroonCategories } from "@/lib/data/theMaroon";
import styles from "./MobileHome.module.css";
const sections = ["Discover", "Courses", "News"] as const;
export function PlatformHome() {
  const [section, setSection] = useState<(typeof sections)[number]>("Discover");
  const category = maroonCategories.find(item => item.slug === (section === "News" ? "news" : "courses"))!;
  return <main className={styles.home}>
    <section className={styles.upper} aria-label="Your next golf trip">
      <h1 className={styles.tagline}>The digital home for competitive golf.</h1>
      <div className={styles.cards} aria-label="Tournament actions">
        <article className={styles.tripCard}>
          <div className={styles.tripPhoto}>
            <Image src="/schedule/mission-hills.webp" alt="" fill priority sizes="(max-width: 600px) 90vw, 550px" />
            <div className={styles.tripOverlay}><span className={styles.kicker}><Flag size={13} aria-hidden="true" /> Your next tradition</span><p>Great golf.<br />Even better company.</p></div>
          </div>
          <Link href="/tournaments/join" className={styles.cardAction}>Join Tournament <span><ArrowRight size={16} aria-hidden="true" /></span></Link>
        </article>
        <article className={styles.tripCard}>
          <div className={styles.tripPhoto}>
            <Image src="/teams/maroon/collage/01-hero-team.jpg" alt="" fill sizes="(max-width: 600px) 90vw, 550px" />
            <div className={styles.tripOverlay}><span className={styles.kicker}><Plus size={14} aria-hidden="true" /> Make it yours</span><p>Your people.<br />Your tournament.</p></div>
          </div>
          <Link href="/tournaments/new" className={styles.cardAction}>Create Tournament <span><ArrowRight size={16} aria-hidden="true" /></span></Link>
        </article>
      </div>
      <div className={styles.accountRow}><p>Already part of the club?</p><Link href="/login">Log In <ArrowRight size={14} aria-hidden="true" /></Link></div>
    </section>
    <section className={styles.discover} aria-label="Explore The Maroon">
      <div className={styles.filters} role="group" aria-label="Explore categories">
        {sections.map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}
      </div>
      <div className={styles.feature}>
        <Image src={category.image} alt="" fill sizes="(max-width: 600px) 100vw, 1120px" />
        <div className={styles.featureCopy}>
          <p className={styles.kicker}>The Maroon &middot; {section === "Discover" ? "Beyond the scorecard" : section}</p>
          <h2>{section === "Discover" ? <>There&apos;s more<br />to the game.</> : category.headline}</h2>
          <p className={styles.description}>{section === "Discover" ? "The places, the people, and the moments between rounds." : category.description}</p>
          <Link href={section === "Discover" ? "/the-maroon" : "/the-maroon/" + category.slug}>Explore {section === "Discover" ? "The Maroon" : section}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  </main>;
}
