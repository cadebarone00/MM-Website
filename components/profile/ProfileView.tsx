"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Settings } from "lucide-react";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { PlayerRoundsList } from "@/components/profile/PlayerRoundsList";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ProfileHistory } from "@/components/profile/ProfileHistory";
import type { ProfileReadModel } from "@/lib/profile/profileReadModel";

type Tab = "overview" | "rounds" | "stats";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rounds", label: "Rounds" },
  { key: "stats", label: "Stats" },
];
const empty = "px-4 py-5 text-center text-maroon-900/60";

/**
 * A profile (the profile read model), laid out like a fantasy-app account screen: your own on /profile, or someone
 * else's on /profile/<username>. Only the owner gets Settings and Edit; a Private profile shows other people its name only.
 */
/** `friendsCount`: people they've been on a golf trip with (lib/profile/friendsServer.ts); null = unknown. */
export function ProfileView({ profile, friendsCount = null }: { profile: ProfileReadModel; friendsCount?: number | null }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { identity, legacy, isOwner } = profile;
  const isPrivate = profile.access === "private";
  return (
    // Extend the profile background through the bottom-menu padding.
    <div className={`flex min-h-screen min-w-0 flex-col text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0 ${tab === "rounds" && !isPrivate ? "bg-maroon-900" : "bg-cream-50"}`}>
      <header className="relative z-10 flex min-h-[228px] flex-col rounded-b-3xl bg-cream-50 text-maroon-900 px-5 pb-3 pt-16">
        {isOwner && <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-full text-maroon-900 hover:text-maroon-700">
          <Settings size={28} aria-hidden="true" />
        </Link>}
        <div className="mx-auto w-full max-w-[640px]">
          <h2 className="break-words pr-12 font-serif text-2xl font-bold leading-tight">{identity.displayName}</h2>
          {/* Photo on the left; Rounds · Friends · Handicap level with it on the right (every round on the profile, friends
              coming soon, and the handicap index from all counting rounds). */}
          <div className="mt-3 flex items-center gap-4">
            <div className="relative shrink-0">
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-cream-50 font-condensed text-3xl font-bold text-maroon-900 shadow-[0_0_0_3px_#380001]">
                {identity.avatarSrc
                  ? <Image src={identity.avatarSrc} alt="" width={96} height={96} unoptimized className="h-full w-full object-cover" />
                  : identity.initials}
              </span>
              {identity.canEditBio && (
                <Link href="/settings" aria-label="Edit profile in Settings"
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-cream-50 text-maroon-900">
                  <Pencil size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
            {!isPrivate && <dl className="grid min-w-0 flex-1 grid-cols-3 text-center" aria-label="Profile numbers">
              {([["Rounds", String(profile.modernStats?.roundsPlayed ?? 0)], ["Friends", friendsCount === null ? "—" : String(friendsCount)], ["Handicap", profile.modernStats?.handicapIndex == null ? "—" : String(profile.modernStats.handicapIndex)]] as const).map(([label, value]) =>
                <div key={label} className="flex flex-col-reverse items-center gap-1">
                  <dt className="font-condensed text-sm text-maroon-900/70">{label}</dt>
                  <dd className="m-0 font-serif text-2xl font-bold leading-none">{value}</dd>
                </div>)}
            </dl>}
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

      <main className={`relative mx-auto -mt-6 w-full max-w-[640px] flex-1 px-4 pb-32 pt-12 ${tab === "rounds" && !isPrivate ? "bg-maroon-900" : "bg-cream-50"}`}>
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
                : <PlayerRoundsList rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} />}
            </section>
          )}
          {tab === "stats" && (
            <section aria-label="Stats">
              <ProfileStats rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} isOwner={isOwner} />
            </section>
          )}
          {tab === "overview" && (
            <section aria-label="Overview">
              <ProfileHistory trips={profile.trips} tournaments={profile.tournaments} teamHistory={profile.teamHistory} isOwner={isOwner} />
            </section>
          )}
        </>}
      </main>
    </div>
  );
}

