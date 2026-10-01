"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Pencil, Settings } from "lucide-react";
import { formatDateRange } from "@/lib/platform/publicSite";
import { CareerGlance } from "@/components/stats/CareerGlance";
import type { MyProfile } from "@/lib/profile/myProfile";
import type { PastTournament } from "@/lib/platform/pastTournaments";

type Tab = "tournaments" | "stats" | "about";
// Pinned Year/Event columns on the Stats table; the solid background hides the columns scrolling under them.
const STICKY_YEAR = "sticky left-0 z-10 w-14 min-w-14 bg-cream-50 pl-4 pr-2";
const STICKY_EVENT = "sticky left-14 z-10 w-28 min-w-28 whitespace-normal bg-cream-50 pr-3 shadow-[1px_0_0_rgba(56,0,1,0.12)]";
const TABS: { key: Tab; label: string }[] = [
  { key: "tournaments", label: "Tournaments" },
  { key: "stats", label: "Stats" },
  { key: "about", label: "About" },
];

/** The signed-in person's own profile, laid out like a fantasy-app account screen. */
export function ProfileView({ profile }: { profile: MyProfile }) {
  const [tab, setTab] = useState<Tab>("tournaments");
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    // Extend the profile background through the bottom-menu padding.
    <div className="flex min-h-screen min-w-0 flex-col bg-cream-50 text-maroon-900 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0">
      <header className="relative flex min-h-[228px] items-center text-cream-50 bg-[radial-gradient(120%_90%_at_50%_0%,#6b161a_0%,#380001_55%,#240001_100%)] px-5 pb-10 pt-20">
        <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 flex h-11 w-11 items-center justify-center rounded-full text-cream-50 hover:text-gold-300">
          <Settings size={28} aria-hidden="true" />
        </Link>
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-5">
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
            {profile.teams.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Teams">
                {profile.teams.map((team) => (
                  <li key={team}
                    className={team === "maroon"
                      ? "rounded-full border border-gold-400 bg-maroon-700 px-3 py-0.5 font-condensed text-xs font-semibold uppercase tracking-wide text-cream-50"
                      : "rounded-full border border-gold-400 bg-cream-50 px-3 py-0.5 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700"}>
                    Team {team === "maroon" ? "Maroon" : "White"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto -mt-6 w-full max-w-[640px] flex-1 rounded-t-3xl bg-cream-50 px-4 pb-32">
        <nav className="mb-5 flex min-h-14 justify-around border-b border-maroon-900/10" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`relative flex min-h-14 flex-1 items-center justify-center px-2 font-condensed text-lg tracking-wide ${tab === t.key ? "font-bold text-maroon-900 after:absolute after:bottom-0 after:h-[3px] after:w-8 after:rounded-full after:bg-gold-500" : "font-medium text-maroon-900/50"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        {tab === "tournaments" && (
          <section aria-label="Tournaments">
            <div className="grid h-11 grid-cols-2 rounded-full bg-maroon-900/5 p-1" role="group" aria-label="Show">
              {[{ label: "Active", on: !showCompleted }, { label: "Completed", on: showCompleted }].map((o) => (
                <button key={o.label} type="button" aria-pressed={o.on} onClick={() => setShowCompleted(o.label === "Completed")}
                  className={`rounded-full font-condensed text-sm font-semibold tracking-wide ${o.on ? "bg-white text-maroon-900 shadow-sm" : "text-maroon-900/55"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="-mx-4 mt-3">
              {showCompleted
                ? <TournamentList rows={profile.completed} empty={<p className="px-4 py-5 text-center text-maroon-900/60">No completed tournaments yet</p>} />
                : <TournamentList rows={profile.active} empty={
                    <p className="px-4 py-5 text-center text-maroon-900/60">No active tournaments<br />
                      <Link href="/tournaments/join" className="mt-2 inline-block font-condensed font-semibold uppercase tracking-[0.12em] text-maroon-700">Join a Tournament</Link>
                    </p>} />}
            </div>
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

        {tab === "about" && (
          <section aria-label="About">
            {profile.bio ? <p className="whitespace-pre-line leading-relaxed text-maroon-900/90">{profile.bio}</p>
              : <p className="px-4 py-5 text-center text-maroon-900/60">No bio yet.</p>}
          </section>
        )}
      </main>
    </div>
  );
}

function TournamentList({ rows, empty }: { rows: PastTournament[]; empty: React.ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-maroon-900/10">
      {rows.map((t) => (
        <li key={`${t.href}-${t.year}`}>
          <Link href={t.href} className="flex min-h-[92px] items-center gap-4 px-5 py-5 transition-colors hover:bg-maroon-900/5">
            <span className="min-w-0 flex-1">
              <strong className="block break-words text-lg font-bold leading-snug">{t.name} {t.year}</strong>
              {t.destination && <span className="mt-1 block break-words text-sm text-maroon-900/65">{t.destination}</span>}
              {t.startDate && <span className="mt-1.5 block text-xs text-maroon-900/50">{formatDateRange(t.startDate, t.endDate)}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-maroon-900/35" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
