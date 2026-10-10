"use client";
import { useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Flag, FlagTriangleRight, GraduationCap, Newspaper, Plane, Trophy } from "lucide-react";
import { ExploreIcon } from "@/components/nav/ImageIcons";
import { maroonCategories } from "@/lib/data/theMaroon";
import { GolfBagIcon } from "./GolfBagIcon";
import { ExploreCourseSearch } from "./ExploreCourseSearch";
import { RoundInvites } from "./RoundInvites";
import { TripPromos } from "./TripPromos";
import styles from "./MobileHome.module.css";
import { motion } from "motion/react";
import { useAppMotion } from "@/components/motion/useAppMotion";
import { beginJoinTournamentTransition } from "@/components/motion/joinTournamentTransition";
const sections = ["Explore", "Courses", "Equipment", "Teaching", "News"] as const;
/** One icon per Explore filter, shown above its label. */
const sectionIcons: Record<(typeof sections)[number], ComponentType<{ size?: number; "aria-hidden"?: "true" }>> = {
  Explore: ExploreIcon,
  Courses: FlagTriangleRight,
  Equipment: GolfBagIcon,
  Teaching: GraduationCap,
  News: Newspaper,
};
/** `signedIn` hides the "Already part of the club? Log In" prompt. */
export function PlatformHome({ signedIn = false }: { signedIn?: boolean }) {
  const { buttonPress, cardInteraction } = useAppMotion();
  const [section, setSection] = useState<(typeof sections)[number]>("Explore");
  // Explore has no category of its own, so it borrows the Courses photo.
  const category = maroonCategories.find(item => item.slug === (section === "Explore" ? "courses" : section.toLowerCase()))!;
  return <main className={styles.home}>
    <section className={styles.upper} aria-label="Play">
      {signedIn && <RoundInvites />}
      {/* Play a normal round: the big card on top. */}
      <motion.article className={`${styles.tripCard} ${styles.soloCard} ${styles.roundCard}`} {...cardInteraction} whileTap={buttonPress.whileTap} transition={buttonPress.transition}>
        <div className={styles.tripPhoto}>
          <Image src="/schedule/mission-hills.webp" alt="" fill priority sizes="(max-width: 600px) 95vw, 1100px" />
          <div className={styles.tripOverlay}><span className={styles.kicker}><Flag size={13} aria-hidden="true" /> Play a round</span><p>Tee it up.<br />Any course, any day.</p></div>
        </div>
        <div className={styles.cardActions}>
          <Link href="/rounds/new" className={styles.cardAction}>Play a round <span><ArrowRight size={16} aria-hidden="true" /></span></Link>
        </div>
      </motion.article>
      {/* Tournaments and golf trips side by side, each opening its page. */}
      <div className={styles.playCards}>
        <Link href="/tournaments/join" className={styles.playCard} onNavigate={beginJoinTournamentTransition}><Trophy size={18} aria-hidden="true" /> Tournament <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/golf-trips" className={styles.playCard}><Plane size={18} aria-hidden="true" /> Golf Trip <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {!signedIn && <div className={styles.accountRow}><p>Already part of the club?</p><Link href="/login">Log In <ArrowRight size={14} aria-hidden="true" /></Link></div>}
    </section>
    <section className={styles.discover} aria-label="Explore The Maroon">
      <div className={styles.filters} role="group" aria-label="Explore categories">
        {sections.map(item => {
          const Icon = sectionIcons[item];
          if (item === "Explore") return <motion.button key={item} {...buttonPress} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><Icon size={22} aria-hidden="true" />{item}</motion.button>;
          return <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><Icon size={22} aria-hidden="true" />{item}</button>;
        })}
      </div>
      {/* Courses turns this spot into course search; every other filter keeps the photo feature. */}
      {section === "Courses" ? <ExploreCourseSearch /> : section === "Explore" ? <TripPromos /> : <div className={styles.feature}>
        <Image src={category.image} alt="" fill sizes="(max-width: 600px) 100vw, 1120px" />
        <div className={styles.featureCopy}>
          <p className={styles.kicker}>The Maroon &middot; {section}</p>
          <h2>{category.headline}</h2>
          <p className={styles.description}>{category.description}</p>
          <Link href={"/the-maroon/" + category.slug}>Explore {section}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>}
    </section>
  </main>;
}
