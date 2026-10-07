"use client";
import { useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Flag, FlagTriangleRight, GraduationCap, Newspaper, Plane, Trophy } from "lucide-react";
import { ExploreIcon } from "@/components/nav/ImageIcons";
import { maroonCategories } from "@/lib/data/theMaroon";
import { MaroonSection } from "@/components/maroon/MaroonSection";
import { SignInRequiredLink } from "./SignInRequiredLink";
import { GolfBagIcon } from "./GolfBagIcon";
import { ExploreCourseSearch } from "./ExploreCourseSearch";
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
  // "Pick a course" opens the Courses filter and brings its course search into view.
  const discoverRef = useRef<HTMLElement>(null);
  const pickCourse = () => { setSection("Courses"); discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return <main className={styles.home}>
    <section className={styles.upper} aria-label="Play">
      {/* Play a normal round: the big card on top. */}
      <motion.article className={`${styles.tripCard} ${styles.soloCard} ${styles.roundCard}`} {...cardInteraction} whileTap={buttonPress.whileTap} transition={buttonPress.transition}>
        <div className={styles.tripPhoto}>
          <Image src="/schedule/mission-hills.webp" alt="" fill priority sizes="(max-width: 600px) 95vw, 1100px" />
          <div className={styles.tripOverlay}><span className={styles.kicker}><Flag size={13} aria-hidden="true" /> Play a round</span><p>Tee it up.<br />Any course, any day.</p></div>
        </div>
        <div className={styles.cardActions}>
          <button type="button" className={styles.cardAction} onClick={pickCourse}>Pick a course <span><ArrowRight size={16} aria-hidden="true" /></span></button>
        </div>
      </motion.article>
      {/* Tournaments and golf trips side by side, each with a join and a create. */}
      <div className={styles.playCards}>
        <article className={styles.playCard} aria-labelledby="play-tournament">
          <h2 id="play-tournament"><Trophy size={18} aria-hidden="true" /> Tournament</h2>
          <Link href="/tournaments/join" className={styles.playAction} onNavigate={beginJoinTournamentTransition}>Join<span className="sr-only"> Tournament</span> <ArrowRight size={15} aria-hidden="true" /></Link>
          <SignInRequiredLink href="/tournaments/create" className={styles.playAction} message="Sign in to create a tournament">Create<span className="sr-only"> Tournament</span> <ArrowRight size={15} aria-hidden="true" /></SignInRequiredLink>
        </article>
        <article className={styles.playCard} aria-labelledby="play-trip">
          <h2 id="play-trip"><Plane size={18} aria-hidden="true" /> Golf Trip</h2>
          <Link href="/golf-trips" className={styles.playAction}>Join<span className="sr-only"> a Trip</span> <ArrowRight size={15} aria-hidden="true" /></Link>
          <SignInRequiredLink href="/tournaments/create/golf-trip" className={styles.playAction} message="Sign in to create a golf trip">Create<span className="sr-only"> a Trip</span> <ArrowRight size={15} aria-hidden="true" /></SignInRequiredLink>
        </article>
      </div>
      {!signedIn && <div className={styles.accountRow}><p>Already part of the club?</p><Link href="/login">Log In <ArrowRight size={14} aria-hidden="true" /></Link></div>}
    </section>
    <section ref={discoverRef} className={styles.discover} aria-label="Explore The Maroon">
      <div className={styles.filters} role="group" aria-label="Explore categories">
        {sections.map(item => {
          const Icon = sectionIcons[item];
          if (item === "Explore") return <motion.button key={item} {...buttonPress} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><Icon size={22} aria-hidden="true" />{item}</motion.button>;
          return <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><Icon size={22} aria-hidden="true" />{item}</button>;
        })}
      </div>
      {/* Courses turns this spot into course search; every other filter keeps the photo feature. */}
      {section === "Courses" ? <ExploreCourseSearch /> : <div className={styles.feature}>
        <Image src={category.image} alt="" fill sizes="(max-width: 600px) 100vw, 1120px" />
        <div className={styles.featureCopy}>
          <p className={styles.kicker}>The Maroon &middot; {section === "Explore" ? "Beyond the scorecard" : section}</p>
          <h2>{section === "Explore" ? <>There&apos;s more<br />to the game.</> : category.headline}</h2>
          <p className={styles.description}>{section === "Explore" ? "The places, the people, and the moments between rounds." : category.description}</p>
          <Link href={section === "Explore" ? "#beyond-the-scorecard" : "/the-maroon/" + category.slug}>Explore {section === "Explore" ? "The Maroon" : section}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>}
    </section>
    <div className="mx-auto max-w-[1120px] bg-cream-50 px-4 py-5 font-title text-ink-900 sm:px-7 sm:py-8">
      <header id="beyond-the-scorecard" className="scroll-mt-4 pt-2"><p className="font-condensed text-xs uppercase tracking-widest text-maroon-700">The Maroon</p><h2 className="mt-2 text-3xl font-bold sm:text-4xl">Beyond the scorecard.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500">The courses, the gear, the lessons, and the stories that bring us back to golf.</p></header>
      <section aria-label="Explore The Maroon categories" className="my-6 grid grid-cols-2 gap-3 sm:my-10 lg:grid-cols-4">
        {maroonCategories.map((item, index) => <Link key={item.slug} href={`/the-maroon/${item.slug}`} className="group rounded-lg border border-gold-300 bg-white p-4 transition-colors hover:bg-cream-100 sm:p-5"><div className="flex justify-between text-maroon-700"><span className="font-condensed text-xs text-ink-400">0{index + 1}</span><ArrowUpRight size={17} /></div><h3 className="mt-4 text-xl font-bold sm:text-2xl">{item.label}</h3><p className="mt-2 text-xs leading-relaxed text-ink-500 sm:text-sm">{item.headline}</p></Link>)}
      </section>
      <div className="space-y-8 pb-8 sm:space-y-12">{maroonCategories.map((item) => <MaroonSection key={item.slug} category={item} />)}</div>
    </div>
  </main>;
}
