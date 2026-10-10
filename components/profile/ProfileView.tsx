"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Settings } from "lucide-react";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { PlayerRoundsList } from "@/components/profile/PlayerRoundsList";
import { ProfileHistory } from "@/components/profile/ProfileHistory";
import { PlayerBioSection } from "@/components/scorecard/PlayerBioSection";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import type { ProfileReadModel } from "@/lib/profile/profileReadModel";

type Tab = "overview" | "rounds" | "stats";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rounds", label: "Rounds" },
  { key: "stats", label: "Stats" },
];

/** The signed-in person's own profile (the profile read model), laid out like a fantasy-app account screen. */
export function ProfileView({ profile }: { profile: ProfileReadModel }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { identity, legacy } = profile;
  return (
    // Extend the profile background through the bottom-menu padding.
    <div className={`flex min-h-screen min-w-0 flex-col text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0 ${tab === "rounds" ? "bg-maroon-900" : "bg-cream-50"}`}>
      <header className="relative z-10 flex min-h-[228px] flex-col rounded-b-3xl bg-cream-50 text-maroon-900 px-5 pb-3 pt-16">
        <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-full text-maroon-900 hover:text-maroon-700">
          <Settings size={28} aria-hidden="true" />
        </Link>
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-5 pl-[10%]">
          <div className="relative shrink-0">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-cream-50 font-condensed text-3xl font-bold text-maroon-900 shadow-[0_0_0_3px_#380001]">
              {identity.avatarSrc
                ? <Image src={identity.avatarSrc} alt="" width={96} height={96} className="h-full w-full object-cover" />
                : identity.initials}
            </span>
            {identity.canEditBio && (
              <Link href="/portal/profile" aria-label="Edit my bio"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-cream-50 text-maroon-900">
                <Pencil size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-serif text-2xl font-bold leading-tight">{identity.displayName}</h2>
            {identity.memberSince && <p className="mt-1 text-sm text-maroon-900/70">Member since {identity.memberSince}</p>}
          </div>
        </div>
        <nav className="mx-auto mt-4 flex min-h-14 w-full max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`relative flex min-h-14 flex-1 items-center justify-center px-2 font-condensed text-lg tracking-wide ${tab === t.key ? "font-bold text-maroon-900 after:absolute after:bottom-1 after:h-[3px] after:w-8 after:rounded-full after:bg-maroon-900" : "font-medium text-maroon-900/65"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={`relative mx-auto -mt-6 w-full max-w-[640px] flex-1 px-4 pb-32 pt-12 ${tab === "rounds" ? "bg-maroon-900" : "bg-cream-50"}`}>
        {tab === "rounds" && (
          <section aria-label="Rounds" className="-mx-4 -mt-6 bg-maroon-900 text-cream-50">
            {legacy?.handicap ? (
              <HandicapHome playerName={identity.displayName} playerSlug={legacy.playerSlug}
                summary={legacy.handicap.summary} archivedRounds={legacy.handicap.archivedRounds}
                team={null} initialTab="overall" readOnly appearance="leaderboard" />
            ) : legacy && <p className="px-4 py-5 text-center text-cream-50/70">Round history is unavailable right now.</p>}
            {/* Saved golf rounds (one per round played) — under the handicap view, or on their own for everyone else. */}
            <PlayerRoundsList rounds={profile.rounds.status === "ok" ? profile.rounds.value : []} />
          </section>
        )}
        {tab === "stats" && (
          <section aria-label="Stats">
            {legacy?.latestScorecard ? <div className="-mx-4 px-7">
              <p className="mb-4 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{legacy.latestScorecard.tournament.editionLabel}</p>
              <PlayerScorecardView scorecard={legacy.latestScorecard.scorecard} tournament={legacy.latestScorecard.tournament}
                shotVideos={legacy.latestScorecard.shotVideos} profile={legacy.bio ?? undefined} />
            </div> : legacy?.bio ? <><p className="text-sm text-maroon-900/60">No scorecard is available yet.</p><PlayerBioSection profile={legacy.bio} /></>
              : <p className="px-4 py-5 text-center text-maroon-900/60">No player bio yet.</p>}
          </section>
        )}
        {tab === "overview" && (
          <section aria-label="Overview">
            {identity.bio ? <p className="whitespace-pre-line leading-relaxed text-maroon-900/90">{identity.bio}</p>
              : <p className="px-4 py-5 text-center text-maroon-900/60">No bio yet.</p>}
            <ProfileHistory trips={profile.trips} tournaments={profile.tournaments} teamHistory={profile.teamHistory} />
          </section>
        )}
      </main>
    </div>
  );
}
