"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Search, Settings } from "lucide-react";
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
const empty = "px-4 py-5 text-center text-cream-50/70";

/**
 * A profile (the profile read model), laid out like a fantasy-app account screen: your own on /profile, or someone
 * else's on /profile/<username>. Only the owner gets Settings and Edit; a Private profile shows other people its name only.
 */
/** `friendsCount`: people they've been on a golf trip with (lib/profile/friendsServer.ts); null = unknown. */
/** `links`: where the gear and the photo's pencil go (the dev profile preview points them at its sample screens). */
/** `friendship` (someone else's profile, signed in): the friend button in the corner, switched on when we're friends. */
export function ProfileView({ profile: real, friendsCount = null, links = { settings: "/settings", edit: "/settings" }, friendship }: { profile: ProfileReadModel; friendsCount?: number | null; links?: { settings: string; edit: string };
  friendship?: { profileId: string; relation: Relation; tripMate: boolean } }) {
  const [tab, setTab] = useState<Tab>("overview");
  // App simulator (dev only) → Profile → "Sample stats data": my own profile shows made-up rounds instead of my real ones.
  const sample = useSimulator()?.state.sampleStats === true && real.isOwner;
  const profile = sample ? withSampleRounds(real) : real;
  const { identity, legacy, isOwner } = profile;
  const isPrivate = profile.access === "private";
  return (
    // Extend the profile background through the bottom-menu padding. Every tab sits on dark maroon, so the top
    // section's curve shows the same way on Overview, Rounds and Stats.
    <div className="profile-root flex min-h-screen min-w-0 flex-col bg-maroon-900 text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0">
      <header className="relative z-10 flex min-h-[228px] flex-col rounded-b-3xl bg-cream-50 text-maroon-900 px-5 pb-3 pt-[70px]">
        {/* Find Golfers (search and friend requests), just left of the gear. */}
        {isOwner && <Link href="/profile/search" aria-label="Find golfers" className="absolute right-16 top-6 flex h-11 w-11 items-center justify-center rounded-full text-maroon-900 hover:text-maroon-700">
          <Search size={26} aria-hidden="true" />
          <FriendRequestBadge />
        </Link>}
        {!isOwner && friendship && <FriendToggle profileId={friendship.profileId} name={identity.displayName} initial={friendship.relation} tripMate={friendship.tripMate} />}
        {isOwner && <Link href={links.settings} aria-label="Settings" className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-full text-maroon-900 hover:text-maroon-700">
          <Settings size={28} aria-hidden="true" />
        </Link>}
        <div className="mx-auto w-full max-w-[640px]">
          {/* Photo on the left; on the right the name, then Rounds · Friends · Handicap under it (every round on the
              profile, friends from golf trips, and the handicap index from all counting rounds). */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <span className="flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full bg-cream-50 font-condensed text-[26px] font-bold text-maroon-900 shadow-[0_0_0_3px_var(--color-maroon-800)]">
                {identity.avatarSrc
                  ? <Image src={identity.avatarSrc} alt="" width={82} height={82} unoptimized className="h-full w-full object-cover" />
                  : identity.initials}
              </span>
              {identity.canEditBio && (
                <Link href={links.edit} aria-label="Edit profile in Settings"
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-cream-50 text-maroon-900">
                  <Pencil size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="min-w-0 flex-1">
            {/* One line, centred over the numbers (it sits below the gear, so it never runs under it). */}
            <h2 className="truncate text-center font-serif text-sm font-bold leading-tight" title={identity.displayName}>{identity.displayName}</h2>
            {/* Rounds · Friends · Handicap show on every profile, Private ones too. */}
            <dl className="mt-2 grid grid-cols-3 text-center" aria-label="Profile numbers">
              {([["Rounds", String(profile.modernStats?.roundsPlayed ?? 0)], ["Friends", friendsCount === null ? "—" : String(friendsCount)], ["Handicap", profile.modernStats?.handicapIndex == null ? "—" : String(profile.modernStats.handicapIndex)]] as const).map(([label, value]) => {
                const stat = <><dt className="font-condensed text-sm text-maroon-900/70">{label}</dt><dd className="m-0 font-serif text-sm font-bold leading-none">{value}</dd></>;
                // My Friends number opens my friends list.
                return label === "Friends" && isOwner
                  ? <Link key={label} href="/profile/friends" aria-label={`Friends: ${value}. See your friends`} className="flex flex-col-reverse items-center gap-1 rounded-lg text-maroon-900 hover:text-maroon-700">{stat}</Link>
                  : <div key={label} className="flex flex-col-reverse items-center gap-1">{stat}</div>;
              })}
            </dl>
            </div>
          </div>
          {/* Under the photo: username, then the bio (small). */}
          <p className="mt-3 break-all text-sm font-semibold text-maroon-900/80">@{identity.username}</p>
          {identity.bio && <p className="mt-1 whitespace-pre-line text-[13px] leading-snug text-maroon-900/85">{identity.bio}</p>}
        </div>
        {!isPrivate && <nav className="mx-auto mt-4 flex min-h-14 w-full max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`relative flex min-h-14 flex-1 items-center justify-center px-2 font-condensed text-lg tracking-wide ${tab === t.key ? "font-bold text-maroon-900 after:absolute after:bottom-1 after:h-[3px] after:w-8 after:rounded-full after:bg-maroon-900" : "font-medium text-maroon-900/65"}`}>
              {t.label}
            </button>
          ))}
        </nav>}
      </header>

      <main className="relative mx-auto -mt-6 w-full max-w-[640px] flex-1 bg-maroon-900 px-4 pb-32 pt-12">
        {isPrivate ? <p className={empty}>This profile is private.</p> : <>
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
              <ProfileStats rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} isOwner={isOwner} />
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
  );
}


/** DEV ONLY (simulator condition): the same profile with 25 made-up rounds, so Stats and Compare can be previewed. */
function withSampleRounds(profile: ProfileReadModel): ProfileReadModel {
  const rounds = sampleProfileRounds(25, 0, 7);
  return { ...profile, rounds: { status: "ok", value: rounds }, modernStats: modernStats(rounds) };
}
