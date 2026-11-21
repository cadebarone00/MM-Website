"use client";
import { useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, FlagTriangleRight, GraduationCap, Newspaper } from "lucide-react";
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
export function PlatformHome({ signedIn = false, ribbon, preview }: { signedIn?: boolean; ribbon?: RibbonSetup; preview?: { displayName: string; username: string; handicapIndex?: number | null } }) {
  const home = <PlatformHomeContent signedIn={signedIn} preview={preview} />;
  return ribbon ? <RibbonProvider setup={ribbon}>{home}</RibbonProvider> : home;
}

function PlatformHomeContent({ signedIn, preview }: { signedIn: boolean; preview?: { displayName: string; username: string; handicapIndex?: number | null } }) {
  const { buttonPress } = useAppMotion();
  const [profile] = useAppData<{ page: MyProfilePage }>(signedIn && !preview ? "/api/app/profile" : null);
  const loaded = profile.status === "ok" && profile.data.page.status === "ok" ? profile.data.page.profile.identity : null;
  const identity = preview ? { ...preview, avatarSrc: null } : loaded;
  const handicap = preview ? preview.handicapIndex : profile.status === "ok" && profile.data.page.status === "ok" ? profile.data.page.profile.modernStats?.handicapIndex : null;
  const [section, setSection] = useState<(typeof sections)[number]>("Explore");
  const [onRange, setOnRange] = useState(false);
  const featured = useFeaturedTrip(BUILT_IN_TRIP);
  return <main className={styles.home}>
    <RibbonAdminBar />
    {!onRange && <section className={styles.upper} aria-label="Play">
      <div className={styles.homeBrand}><h1>The Maroon</h1><Image src="/brand/maroon-m-white.svg" alt="" width={36} height={36} /></div>
      <div className={styles.profileSnapshot}>
        <Link href={signedIn ? "/profile" : "/login"} className={styles.profileLink}>
          <ProfileAvatar name={identity?.displayName ?? "You"} photoUrl={identity?.avatarSrc} size={40} />
          <span><strong>{identity?.displayName ?? (signedIn ? "Your profile" : "Sign in")}</strong><small>{identity ? `@${identity.username}` : signedIn ? "View your profile" : "Sign in to view your profile"}</small></span>
        </Link>
      </div>
      <div className={styles.homeCircles}>
        <div><span className={styles.homeCircle} aria-label={handicap == null ? "Handicap unavailable" : `Handicap ${handicap}`}>{handicap ?? "—"}</span><span>Play</span></div>
        <div><span className={styles.homeCircle}><Image src="/brand/maroon-m-white.svg" alt="" width={36} height={36} /></span><span>Live</span></div>
        <div><button type="button" className={styles.homeCircle} aria-label="Open On The Range" onClick={() => setOnRange(true)}><ExploreIcon size={36} aria-hidden="true" /></button><span>On The Range</span></div>
      </div>
      <section className={styles.homeFeed} aria-label="Feed"><h2>Feed</h2></section>
      {signedIn && !preview && <RoundInvites />}
      {signedIn && <div className={styles.joinCard}><JoinCodeCard kind="round" /></div>}
      {!signedIn && <div className={styles.accountRow}><p>Already part of the club?</p><Link href="/login">Log In <ArrowRight size={14} aria-hidden="true" /></Link></div>}
    </section>}
    {onRange && <section className={styles.discover} aria-label="On The Range">
      <div className={styles.rangeHeader}><button type="button" onClick={() => setOnRange(false)} aria-label="Back to Home"><ArrowLeft size={22} aria-hidden="true" /></button><h1>On The Range</h1></div>
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
    </section>}
  </main>;
}
