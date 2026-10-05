"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, Settings } from "lucide-react";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { CareerGlance } from "@/components/stats/CareerGlance";
import type { MyProfile } from "@/lib/profile/myProfile";

type Tab = "overview" | "rounds" | "stats";
// Pinned Year/Event columns on the Stats table; the solid background hides the columns scrolling under them.
const STICKY_YEAR = "sticky left-0 z-10 w-14 min-w-14 bg-cream-50 pl-4 pr-2";
const STICKY_EVENT = "sticky left-14 z-10 w-28 min-w-28 whitespace-normal bg-cream-50 pr-3 shadow-[1px_0_0_rgba(56,0,1,0.12)]";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rounds", label: "Rounds" },
  { key: "stats", label: "Stats" },
];

/** The signed-in person's own profile, laid out like a fantasy-app account screen. */
export function ProfileView({ profile }: { profile: MyProfile }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    // Extend the profile background through the bottom-menu padding.
    <div className="flex min-h-screen min-w-0 flex-col bg-cream-50 text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0">
      <header className="relative z-10 flex min-h-[228px] flex-col rounded-b-3xl text-cream-50 bg-[radial-gradient(120%_90%_at_50%_0%,#6b161a_0%,#380001_55%,#240001_100%)] px-5 pb-3 pt-16">
        <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
          <Settings size={28} aria-hidden="true" />
        </Link>
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-5 pl-[10%]">
          <div className="relative shrink-0">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-maroon-600 font-condensed text-3xl font-bold text-cream-50 shadow-[0_0_0_3px_#c9a86e]">
              {profile.avatarSrc
                ? <Image src={profile.avatarSrc} alt="" width={96} height={96} className="h-full w-full object-cover" />
                : profile.initials}
            </span>
            {profile.canEditBio && (
              <Link href="/portal/profile" aria-label="Edit my bio"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-gold-400 text-maroon-900">
                <Pencil size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-serif text-2xl font-bold leading-tight">{profile.name}</h2>
            {profile.memberSince && <p className="mt-1 text-sm text-cream-50/70">Member since {profile.memberSince}</p>}
          </div>
        </div>
        <nav className="mx-auto mt-4 flex min-h-14 w-full max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`relative flex min-h-14 flex-1 items-center justify-center px-2 font-condensed text-lg tracking-wide ${tab === t.key ? "font-bold text-cream-50 after:absolute after:bottom-1 after:h-[3px] after:w-8 after:rounded-full after:bg-gold-500" : "font-medium text-cream-50/55"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="relative mx-auto -mt-6 w-full max-w-[640px] flex-1 bg-cream-50 px-4 pb-32 pt-12">
        {tab === "rounds" && (
          <section aria-label="Rounds" className="-mx-4 -mt-6">
            {profile.roundHistory ? (
              <HandicapHome playerName={profile.name} playerSlug={profile.roundHistory.playerSlug}
                summary={profile.roundHistory.summary} archivedRounds={profile.roundHistory.archivedRounds}
                team={null} initialTab="overall" readOnly />
            ) : <p className="px-4 py-5 text-center text-maroon-900/60">{profile.canEditBio ? "Round history is unavailable right now." : "No rounds yet."}</p>}
          </section>
        )}
        {tab === "stats" && (
          <section aria-label="Stats">
            {!profile.stats ? <p className="px-4 py-5 text-center text-maroon-900/60">No stats yet.</p> : (
              <>
                {/* Year + Event stay pinned while the stat columns scroll sideways. */}
                <div className="-mx-4 overflow-x-auto">
                  <table className="min-w-full whitespace-nowrap text-sm">
                    <thead><tr className="font-condensed uppercase tracking-wide text-maroon-900/60">
                      <th className={`${STICKY_YEAR} py-2 text-left font-semibold`}>Year</th>
                      <th className={`${STICKY_EVENT} py-2 text-left font-semibold`}>Event</th>
                      {profile.stats.columns.map((c) => <th key={c} className="px-3 py-2 text-right font-semibold">{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {profile.stats.rows.map((r) => (
                        <tr key={r.year} className="border-t border-maroon-900/10">
                          <th scope="row" className={`${STICKY_YEAR} py-2 text-left font-semibold tabular-nums`}>{r.year}</th>
                          <td className={`${STICKY_EVENT} py-2 text-left`}>{r.event}</td>
                          {r.values.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v ?? "—"}</td>)}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gold-400/60 font-semibold text-maroon-700">
                        <th scope="row" className={`${STICKY_YEAR} py-2 text-left font-condensed uppercase tracking-wide`}>Total</th>
                        <td className={`${STICKY_EVENT} py-2`} />
                        {profile.stats.totals.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v ?? "—"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-6"><CareerGlance yearStats={profile.stats.played} tone="light" /></div>
              </>
            )}
          </section>
        )}

        {tab === "overview" && (
          <section aria-label="Overview">
            {profile.bio ? <p className="whitespace-pre-line leading-relaxed text-maroon-900/90">{profile.bio}</p>
              : <p className="px-4 py-5 text-center text-maroon-900/60">No bio yet.</p>}
          </section>
        )}
      </main>
    </div>
  );
}
