"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChartNoAxesColumn, ChevronLeft, Lock, Pencil, Search, Settings } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon } from "./SocialIcon";
import { socialDisplay, socialLabel } from "@/lib/profile/profileSocials";
import { FriendRequestBadge } from "./FriendRequestBadge";
import { FriendToggle } from "./FriendToggle";
import type { Relation } from "@/lib/profile/friendRequestsServer";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { PlayerRoundsList } from "@/components/profile/PlayerRoundsList";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { sampleProfileRounds } from "@/lib/dev/sampleProfileRounds";
import { modernStats } from "@/lib/profile/profileReadModel";
import { ProfileHistory } from "@/components/profile/ProfileHistory";
import type { ProfileReadModel } from "@/lib/profile/profileReadModel";

type Tab = "overview" | "rounds" | "stats";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rounds", label: "Rounds" },
  { key: "stats", label: "Stats" },
];

/**
 * A profile (the profile read model), laid out like a fantasy-app account screen: your own on /profile, or someone
 * else's on /profile/<username> (Instagram-style: Back, @username, buttons row). Only the owner gets Settings, Edit and
 * Search; someone else's Private profile shows its top (no Friends count) and greyed-out tabs.
 */
/** `friendsCount`: people they've been on a golf trip with (lib/profile/friendsServer.ts); null = unknown. */
/** `links`: where the gear, the pencil, the search icon, Back and Compare go (the dev profile preview points them at its sample screens). */
/** `friendship` (someone else's profile): the Add friend button in the buttons row. `friendSave` (dev preview only): instead of the account. */
/** `friends`: my Friends count (Search → Friends tab). `friendsOf`: someone's Friends count, "{username}" = theirs. */
type ProfileLinks = { settings: string; edit: string; search?: string; profile?: string; friends?: string; friendsOf?: string };

/** `compare` ("?compare=<username>" on my profile, from someone's Compare button): opens my Stats with them picked. */
export function ProfileView({ profile: real, friendsCount = null, links = { settings: "/settings", edit: "/settings" }, friendship, friendSave, compare = null }: { profile: ProfileReadModel; friendsCount?: number | null; links?: ProfileLinks;
  friendship?: { profileId: string; relation: Relation; tripMate: boolean }; friendSave?: (off: boolean) => Promise<Relation>; compare?: string | null }) {
  const router = useRouter();
  const searchHref = links.search ?? "/profile/search";
  const profileHref = links.profile ?? "/profile";
  const friendsHref = links.friends ?? "/profile/search?tab=friends";
  const friendsOfHref = (links.friendsOf ?? "/profile/{username}/friends").replace("{username}", encodeURIComponent(real.identity.username));
  const compareName = real.isOwner ? compare : null;
  const [tab, setTab] = useState<Tab>(real.isOwner && compareName ? "stats" : "overview");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "stats") setTab("stats"); }, []);
  // App simulator (dev only) → Profile → "Sample stats data": my own profile shows made-up rounds instead of my real ones.
  const sample = useSimulator()?.state.sampleStats === true && real.isOwner;
  const profile = sample ? withSampleRounds(real) : real;
  const { identity, legacy, isOwner } = profile;
  const isPrivate = profile.access === "private";
  const handicap = profile.modernStats?.handicapIndex == null ? "—" : String(profile.modernStats.handicapIndex);
  const rounds = String(profile.modernStats?.roundsPlayed ?? 0);
  const friendsText = friendsCount === null ? "—" : String(friendsCount);
  const stat = (label: string, value: string) => <><dt className="font-condensed text-[13px] text-cream-50/70">{label}</dt><dd className="m-0 font-serif text-[17px] font-bold leading-none">{value}</dd></>;
  const avatar = identity.avatarSrc
    ? <span className="flex h-[86px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-cream-50 shadow-[0_0_0_3px_var(--color-gold-300)]">
      <Image src={identity.avatarSrc} alt="" width={86} height={86} unoptimized className="h-full w-full object-cover" />
    </span>
    : <ProfileAvatar name={identity.displayName || identity.username} size={86} />;
  const bioAndSocials = <>
    {identity.bio && <p className="mt-1 line-clamp-3 max-w-[90%] whitespace-pre-line font-condensed text-[13px] leading-snug text-cream-50/85">{identity.bio}</p>}
    {/* Socials (up to 4), 2 across × 2 down under the bio; only the ones added show. */}
    {identity.links.length > 0 && <ul className="mt-2.5 grid max-w-[90%] grid-cols-2 gap-x-4 gap-y-1.5" aria-label="Socials">
      {identity.links.map((social) => <li key={social.platform} className="min-w-0">
        <a href={social.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={`${socialLabel(social.platform)}: ${socialDisplay(social)}`}
          className="flex min-w-0 items-center gap-1.5 font-condensed text-[13px] font-semibold text-gold-300 hover:underline">
          <span className="shrink-0"><SocialIcon platform={social.platform} size={15} /></span><span className="truncate">{socialDisplay(social)}</span>
        </a>
      </li>)}
    </ul>}
  </>;
  const iconTop = { top: "var(--app-top-clearance, 0px)" };
  return (<>
    {/* Extend the profile background through the bottom-menu padding. Owner request 2026-11-02: the top section is maroon
        and everything under it is cream (.profile-body in app/globals.css gives the tabs the light palette), so the maroon
        curve shows the same way on Overview, Rounds and Stats. */}
    <div className="app-own-top-clearance profile-root flex min-h-screen min-w-0 flex-col bg-[#fbf8f1] text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0">
      {/* The icon row starts on the app's icon line (--app-top-clearance, app/globals.css: 8px below the safe area /
          status bar) and everything else lower, so nothing lands where the clock, battery or notch are. */}
      <header className="profile-hero relative z-10 flex min-h-[228px] flex-col rounded-b-3xl bg-maroon-900 text-cream-50 px-5 pb-3" style={{ paddingTop: `calc(var(--app-top-clearance, 0px) + ${isOwner ? 60 : 56}px)` }}>
        {isOwner ? <>
          {/* Search (golfers + friend requests), just left of the gear: opens the Search page. */}
          <Link href={searchHref} aria-label="Search golfers" style={iconTop} className="absolute right-16 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
            <Search size={26} aria-hidden="true" />
            <FriendRequestBadge />
          </Link>
          <Link href={links.settings} aria-label="Settings" style={iconTop} className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
            <Settings size={28} aria-hidden="true" />
          </Link>
          {/* Edit profile: top left, mirroring the gear (owner request 2026-11-02). */}
          {identity.canEditBio && <Link href={links.edit} aria-label="Edit profile" style={iconTop} className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
            <Pencil size={26} aria-hidden="true" />
          </Link>}
        </> : <>
          {/* Someone else's profile, Instagram-style (owner request 2026-11-19): Back on the left, their @username centred. */}
          <button type="button" aria-label="Back" style={iconTop} onClick={() => { if (window.history.length > 1) router.back(); else router.push(searchHref); }}
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
            <ChevronLeft size={30} aria-hidden="true" />
          </button>
          <h1 style={iconTop} className="absolute inset-x-16 m-0 flex h-11 items-center justify-center gap-1.5 truncate font-serif text-[17px] font-bold">
            {isPrivate && <Lock size={14} aria-label="Private profile" className="shrink-0 text-gold-300" />}<span className="truncate">{identity.username}</span>
          </h1>
        </>}
        <div className="mx-auto w-full max-w-[640px]">
          {isOwner ? <>
            {/* My profile (owner request 2026-11-02): the photo on the left; beside it the name, @username and Friends · Rounds · Handicap. */}
            <div className="flex items-center gap-5">
              {avatar}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-left font-serif text-[18px] font-bold leading-tight" title={identity.displayName}>{identity.displayName}</h2>
                <p className="mt-0.5 truncate text-left text-[13px] font-semibold leading-tight text-gold-300">@{identity.username}</p>
                <dl className="mt-2.5 grid grid-cols-3 text-center" aria-label="Profile numbers">
                  <Link href={friendsHref} aria-label={`Friends: ${friendsText}. See your friends`} className="flex flex-col-reverse items-center gap-0.5 rounded-lg text-cream-50 hover:text-gold-300">{stat("Friends", friendsText)}</Link>
                  <div className="flex flex-col-reverse items-center gap-0.5">{stat("Rounds", rounds)}</div>
                  <div className="flex flex-col-reverse items-center gap-0.5">{stat("Handicap", handicap)}</div>
                </dl>
              </div>
            </div>
            <div className="mt-2">{bioAndSocials}</div>
          </> : <>
            {/* Their profile: photo, then Rounds · Friends · Handicap beside it (a Private profile hides its Friends count,
                owner request 2026-11-19); their name, bio and socials under; then the buttons row. */}
            <div className="flex items-center gap-5">
              {avatar}
              <dl className={`grid flex-1 text-center ${isPrivate ? "grid-cols-2" : "grid-cols-3"}`} aria-label="Profile numbers">
                <div className="flex flex-col-reverse items-center gap-0.5">{stat("Rounds", rounds)}</div>
                {/* A Public profile's Friends count opens their Friends list (owner request 2026-11-20). */}
                {!isPrivate && <Link href={friendsOfHref} aria-label={`Friends: ${friendsText}. See ${identity.displayName}'s friends`} className="flex flex-col-reverse items-center gap-0.5 rounded-lg text-cream-50 hover:text-gold-300">{stat("Friends", friendsText)}</Link>}
                <div className="flex flex-col-reverse items-center gap-0.5">{stat("Handicap", handicap)}</div>
              </dl>
            </div>
            <h2 className="mt-3 truncate font-serif text-[16px] font-bold leading-tight" title={identity.displayName}>{identity.displayName}</h2>
            {bioAndSocials}
            {(friendship || !isPrivate) && <div className={`mt-3 grid gap-2 ${friendship && !isPrivate ? "grid-cols-2" : "grid-cols-1"}`}>
              {friendship && <FriendToggle wide profileId={friendship.profileId} name={identity.displayName} initial={friendship.relation} tripMate={friendship.tripMate} save={friendSave} />}
              {!isPrivate && <Link href={`${profileHref}?compare=${encodeURIComponent(identity.username)}`}
                className="flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-cream-50/12 font-serif text-[14px] font-bold text-cream-50 hover:bg-cream-50/20">
                <ChartNoAxesColumn size={16} aria-hidden="true" /> Compare
              </Link>}
            </div>}
          </>}
        </div>
        {/* The tabs. On someone else's Private profile they show greyed out and can't be tapped (owner request 2026-11-19). */}
        <nav className="mx-auto mt-4 flex min-h-14 w-full max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => isPrivate
            ? <span key={t.key} aria-disabled="true" className="flex min-h-14 flex-1 cursor-not-allowed items-center justify-center px-2 font-condensed text-lg font-medium tracking-wide text-cream-50/30">{t.label}</span>
            : <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`relative flex min-h-14 flex-1 items-center justify-center px-2 font-condensed text-lg tracking-wide ${tab === t.key ? "font-bold text-cream-50 after:absolute after:bottom-1 after:h-[3px] after:w-8 after:rounded-full after:bg-gold-300" : "font-medium text-cream-50/65"}`}>
              {t.label}
            </button>)}
        </nav>
      </header>

      <main className="profile-body relative mx-auto -mt-6 w-full max-w-[640px] flex-1 px-4 pb-32 pt-12">
        {/* Someone else's Private profile: the whole top shows, the bottom is only this (owner request 2026-11-13). */}
        {isPrivate ? <p className="flex flex-col items-center gap-2 py-10 text-center font-serif text-xl font-bold text-maroon-900"><Lock size={26} aria-hidden="true" className="text-maroon-700" />Private Profile</p> : <>
          {tab === "rounds" && (
            <section aria-label="Rounds" className="-mx-4 -mt-6 bg-maroon-900 text-cream-50">
              {/* LEGACY: the original Maroon handicap history (owner only), kept separate from modern rounds. */}
              {legacy?.handicap ? (
                <HandicapHome playerName={identity.displayName} playerSlug={legacy.playerSlug}
                  summary={legacy.handicap.summary} archivedRounds={legacy.handicap.archivedRounds}
                  team={null} initialTab="overall" readOnly appearance="leaderboard" />
              ) : legacy && isOwner && <p className="px-4 py-5 text-center text-cream-50/70">Maroon round history is unavailable right now.</p>}
              {profile.rounds.status === "unavailable"
                ? <p className="px-4 py-5 text-center text-cream-50/70">Rounds can&apos;t be loaded right now.</p>
                : <PlayerRoundsList rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} name={identity.displayName} avatarUrl={identity.avatarSrc} />}
            </section>
          )}
          {tab === "stats" && (
            <section aria-label="Stats">
              <ProfileStats rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} isOwner={isOwner} compareWith={isOwner && compareName ? { username: compareName, name: compareName } : null} />
            </section>
          )}
          {tab === "overview" && (
            <section aria-label="Overview" className="text-cream-50">
              <ProfileHistory trips={profile.trips} tournaments={profile.tournaments} teamHistory={profile.teamHistory} isOwner={isOwner} />
            </section>
          )}
        </>}
      </main>
    </div>
  </>);
}


/** DEV ONLY (simulator condition): the same profile with 25 made-up rounds, so Stats and Compare can be previewed. */
function withSampleRounds(profile: ProfileReadModel): ProfileReadModel {
  const rounds = sampleProfileRounds(25, 0, 7);
  return { ...profile, rounds: { status: "ok", value: rounds }, modernStats: modernStats(rounds) };
}
