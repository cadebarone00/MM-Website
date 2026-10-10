"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Settings } from "lucide-react";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { PlayerRoundsList } from "@/components/profile/PlayerRoundsList";
import { ProfileHistory } from "@/components/profile/ProfileHistory";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import type { ModernStats, ProfileReadModel } from "@/lib/profile/profileReadModel";

type Tab = "overview" | "rounds" | "stats";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rounds", label: "Rounds" },
  { key: "stats", label: "Stats" },
];
const empty = "px-4 py-5 text-center text-maroon-900/60";
const label = "m-0 font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700";

/**
 * A profile (the profile read model), laid out like a fantasy-app account screen: your own on /profile, or someone
 * else's on /profile/<username>. Only the owner gets Settings and Edit; a Private profile shows other people its name only.
 */
export function ProfileView({ profile }: { profile: ProfileReadModel }) {
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
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-5 pl-[10%]">
          <div className="relative shrink-0">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-cream-50 font-condensed text-3xl font-bold text-maroon-900 shadow-[0_0_0_3px_#380001]">
              {identity.avatarSrc
                ? <Image src={identity.avatarSrc} alt="" width={96} height={96} className="h-full w-full object-cover" />
                : identity.initials}
            </span>
            {identity.canEditBio && (
              <Link href="/profile/edit" aria-label="Edit profile"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-cream-50 text-maroon-900">
                <Pencil size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-serif text-2xl font-bold leading-tight">{identity.displayName}</h2>
            <p className="mt-0.5 break-all text-sm text-maroon-900/70">@{identity.username}</p>
            {identity.memberSince && <p className="mt-1 text-sm text-maroon-900/70">Member since {identity.memberSince}</p>}
          </div>
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
              <StatsCard stats={profile.modernStats} isOwner={isOwner} />
              {/* LEGACY HISTORY: the latest original Maroon scorecard — golf data only, in its own archive section. */}
              {legacy?.latestScorecard && <section aria-label="The Maroon Tournament archive" className="mt-10">
                <h3 className={label}>The Maroon Tournament archive</h3>
                <div className="-mx-4 mt-3 px-7">
                  <p className="mb-4 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{legacy.latestScorecard.tournament.editionLabel}</p>
                  <PlayerScorecardView scorecard={legacy.latestScorecard.scorecard} tournament={legacy.latestScorecard.tournament}
                    shotVideos={legacy.latestScorecard.shotVideos} />
                </div>
              </section>}
            </section>
          )}
          {tab === "overview" && (
            <section aria-label="Overview">
              {identity.bio ? <p className="whitespace-pre-line leading-relaxed text-maroon-900/90">{identity.bio}</p>
                : <p className={empty}>{isOwner ? <>No bio yet. <Link href="/profile/edit" className="underline underline-offset-4">Add one</Link>.</> : "No bio yet."}</p>}
              <ProfileHistory trips={profile.trips} tournaments={profile.tournaments} teamHistory={profile.teamHistory} isOwner={isOwner} />
            </section>
          )}
        </>}
      </main>
    </div>
  );
}

/** Modern stats from finished rounds — only what the rounds really support; a calm empty state otherwise. */
function StatsCard({ stats, isOwner }: { stats: ModernStats | null; isOwner: boolean }) {
  if (!stats) return <p className={empty}>{isOwner ? "Stats will show here once you finish rounds." : "No stats to show yet."}</p>;
  const items: [string, string][] = [
    ["Rounds", String(stats.roundsPlayed)],
    ["18-hole average", stats.average18 === null ? "—" : String(stats.average18)],
    ["Best 18", stats.best18 === null ? "—" : String(stats.best18)],
    ["Handicap index", stats.handicapIndex === null ? "—" : String(stats.handicapIndex)],
  ];
  return <section aria-label="Round stats">
    <h3 className={label}>Round stats</h3>
    <dl className="mt-3 grid grid-cols-2 gap-3">
      {items.map(([name, value]) => <div key={name} className="rounded-md border border-maroon-900/15 bg-white px-4 py-3">
        <dt className="text-sm text-maroon-900/65">{name}</dt>
        <dd className="m-0 font-serif text-2xl font-bold">{value}</dd>
      </div>)}
    </dl>
    {stats.handicapIndex === null && <p className="mt-2 text-sm text-maroon-900/60">A handicap index needs at least 3 rounds that count ({stats.countingRounds} so far).</p>}
  </section>;
}
