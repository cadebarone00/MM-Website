"use client";
import { useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Flag, FlagTriangleRight, GraduationCap, Newspaper, Plane, Trophy, Users } from "lucide-react";
import { ExploreIcon } from "@/components/nav/ImageIcons";
import { GolfBagIcon } from "./GolfBagIcon";
import { ExploreCourseSearch } from "./ExploreCourseSearch";
import { RoundInvites } from "./RoundInvites";
import { JoinCodeCard } from "./JoinCodeCard";
import { BUILT_IN_TRIP, TripPromos } from "./TripPromos";
import { RibbonProvider, type RibbonSetup } from "./ribbon/RibbonProvider";
import { RibbonAdminBar } from "./ribbon/RibbonAdminBar";
import { RibbonTabPosts, useFeaturedTrip } from "./ribbon/RibbonCards";
import styles from "./MobileHome.module.css";
import { motion } from "motion/react";
import { useAppMotion } from "@/components/motion/useAppMotion";
import { beginJoinTournamentTransition } from "@/components/motion/joinTournamentTransition";
import { useAppData } from "@/components/app/useAppData";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { MyProfilePage } from "@/lib/profile/myProfileServer";
const sections = ["Explore", "Courses", "Equipment", "Teaching", "News"] as const;
/** One icon per Explore filter, shown above its label. */
const sectionIcons: Record<(typeof sections)[number], ComponentType<{ size?: number; "aria-hidden"?: "true" }>> = {
  Explore: ExploreIcon,
  Courses: FlagTriangleRight,
  Equipment: GolfBagIcon,
  Teaching: GraduationCap,
  News: Newspaper,
};
/** `signedIn` hides the "Already part of the club? Log In" prompt. `ribbon` = admin-posted tab content (spec "Play page
 * ribbon content"); without it the ribbon shows only the built-in content, as before. */
// `preview` (dev Mock people only): this name / username in the profile snapshot instead of loading the signed-in profile.
export function PlatformHome({ signedIn = false, ribbon, preview }: { signedIn?: boolean; ribbon?: RibbonSetup; preview?: { displayName: string; username: string } }) {
  const home = <PlatformHomeContent signedIn={signedIn} preview={preview} />;
  return ribbon ? <RibbonProvider setup={ribbon}>{home}</RibbonProvider> : home;
}

function PlatformHomeContent({ signedIn, preview }: { signedIn: boolean; preview?: { displayName: string; username: string } }) {
  const { buttonPress } = useAppMotion();
  const [profile] = useAppData<{ page: MyProfilePage }>(signedIn && !preview ? "/api/app/profile" : null);
  const loaded = profile.status === "ok" && profile.data.page.status === "ok" ? profile.data.page.profile.identity : null;
  const identity = preview ? { ...preview, avatarSrc: null } : loaded;
  const [section, setSection] = useState<(typeof sections)[number]>("Explore");
  const featured = useFeaturedTrip(BUILT_IN_TRIP);
  return <main className={styles.home}>
    <RibbonAdminBar />
    <section className={styles.upper} aria-label="Play">
      <div className={styles.homeBrand}><h1>The Maroon</h1><Image src="/brand/maroon-m-white.svg" alt="" width={36} height={36} /></div>
      <details className={styles.profileSnapshot} open>
        <summary>YOUR PROFILE</summary>
        <Link href={signedIn ? "/profile" : "/login"} className={styles.profileLink}>
          <ProfileAvatar name={identity?.displayName ?? "You"} photoUrl={identity?.avatarSrc} size={40} />
          <span><strong>{identity?.displayName ?? (signedIn ? "Your profile" : "Sign in")}</strong><small>{identity ? `@${identity.username}` : signedIn ? "View your profile" : "Sign in to view your profile"}</small></span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </details>
      {signedIn && !preview && <RoundInvites />}
      <div className={styles.playCards}>
        <Link href="/rounds/new" className={styles.playCard}><Flag size={18} aria-hidden="true" /> Play <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/golf-trips" className={styles.playCard}><Plane size={18} aria-hidden="true" /> Golf Trip <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/tournaments/join" className={styles.playCard} onNavigate={beginJoinTournamentTransition}><Trophy size={18} aria-hidden="true" /> Tournament <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/leagues" className={styles.playCard}><Users size={18} aria-hidden="true" /> League <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {signedIn && <div className={styles.joinCard}><JoinCodeCard kind="round" /></div>}
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
      {/* Explore keeps the featured trip and Courses keeps course search; every other filter is posts only. */}
      {section === "Courses" ? <><ExploreCourseSearch /><RibbonTabPosts tab="Courses" /></>
        : section === "Explore" ? <><TripPromos trip={featured.trip} adminSlot={featured.controls} /><RibbonTabPosts tab="Explore" />{featured.editor}</>
        : <RibbonTabPosts tab={section} showEmpty />}
    </section>
  </main>;
}
