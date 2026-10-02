"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Flag, Plus } from "lucide-react";
import { maroonCategories } from "@/lib/data/theMaroon";
import { MaroonSection } from "@/components/maroon/MaroonSection";
import { SignInRequiredLink } from "./SignInRequiredLink";
import styles from "./MobileHome.module.css";
const sections = ["Discover", "Courses", "Equipment", "Teaching", "News"] as const;
/** `signedIn` hides the "Already part of the club? Log In" prompt. */
export function PlatformHome({ signedIn = false }: { signedIn?: boolean }) {
  const [section, setSection] = useState<(typeof sections)[number]>("Discover");
  // Discover has no category of its own, so it borrows the Courses photo.
  const category = maroonCategories.find(item => item.slug === (section === "Discover" ? "courses" : section.toLowerCase()))!;
  return <main className={styles.home}>
    <section className={styles.upper} aria-label="Your next golf trip">
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
          <SignInRequiredLink href="/tournaments/create" className={styles.cardAction} message="Sign in to create a tournament">Create Tournament <span><ArrowRight size={16} aria-hidden="true" /></span></SignInRequiredLink>
        </article>
      </div>
      {!signedIn && <div className={styles.accountRow}><p>Already part of the club?</p><Link href="/login">Log In <ArrowRight size={14} aria-hidden="true" /></Link></div>}
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
          <Link href={section === "Discover" ? "#beyond-the-scorecard" : "/the-maroon/" + category.slug}>Explore {section === "Discover" ? "The Maroon" : section}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
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
