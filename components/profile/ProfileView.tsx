"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Flag, Pencil, Settings } from "lucide-react";
import { formatDateRange } from "@/lib/platform/publicSite";
import { CareerGlance } from "@/components/stats/CareerGlance";
import type { MyProfile } from "@/lib/profile/myProfile";
import type { PastTournament } from "@/lib/platform/pastTournaments";

type Tab = "tournaments" | "stats" | "about";
// Pinned Year/Event columns on the Stats table; the solid background hides the columns scrolling under them.
const STICKY_YEAR = "sticky left-0 z-10 w-14 min-w-14 bg-[#1a0001] pl-4 pr-2";
const STICKY_EVENT = "sticky left-14 z-10 w-28 min-w-28 whitespace-normal bg-[#1a0001] pr-3 shadow-[1px_0_0_rgba(251,248,241,0.15)]";
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
    // The negative margin runs the dark page through the site's bottom-menu padding
    // (SITE_BOTTOM_NAV_CONTENT_CLASS), so no cream strip shows under it on phones.
    <div className="flex min-h-screen flex-col bg-maroon-900 text-cream-50 mb-[calc(-5.75rem-env(safe-area-inset-bottom))] lg:mb-0">
      <header className="relative bg-[radial-gradient(120%_90%_at_50%_0%,#6b161a_0%,#380001_55%,#240001_100%)] px-4 pb-0 pt-6">
        <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 rounded-full p-1 text-cream-50 hover:text-gold-300">
          <Settings size={28} aria-hidden="true" />
        </Link>
        <div className="mx-auto flex max-w-[640px] items-center gap-4 pr-10">
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
        <nav className="mx-auto mt-6 flex max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`border-b-4 px-2 pb-2 font-condensed text-lg font-semibold tracking-wide ${tab === t.key ? "border-gold-400 text-cream-50" : "border-transparent text-cream-50/55"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={`mx-auto w-full max-w-[640px] flex-1 rounded-t-3xl bg-[#1a0001] px-4 pb-32 ${tab === "stats" ? "pt-1" : "pt-6"}`}>
        {tab === "tournaments" && (
          <section aria-label="Tournaments">
            <div className="grid grid-cols-2 rounded-full border border-cream-50/40 p-0.5" role="group" aria-label="Show">
              {[{ label: "Active", on: !showCompleted }, { label: "Completed", on: showCompleted }].map((o) => (
                <button key={o.label} type="button" aria-pressed={o.on} onClick={() => setShowCompleted(o.label === "Completed")}
                  className={`rounded-full py-2 font-condensed text-sm font-semibold uppercase tracking-[0.12em] ${o.on ? "bg-cream-50 text-maroon-900" : "text-cream-50"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 divide-x divide-cream-50/20 text-center">
              <div><p className="font-condensed text-5xl font-bold text-gold-300">{profile.active.length}</p><p className="text-sm text-cream-50/70">Active</p></div>
              <div><p className="font-condensed text-5xl font-bold text-gold-300">{profile.completed.length}</p><p className="text-sm text-cream-50/70">Played</p></div>
            </div>
            <div className="mt-6">
              {showCompleted
                ? <TournamentList rows={profile.completed} empty={<p className="text-center text-cream-50/70">No completed tournaments yet</p>} />
                : <TournamentList rows={profile.active} empty={
                    <p className="text-center text-cream-50/70">No active tournaments<br />
                      <Link href="/tournaments/join" className="mt-2 inline-block font-condensed font-semibold uppercase tracking-[0.12em] text-gold-300">Join a Tournament</Link>
                    </p>} />}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section aria-label="Stats">
            {!profile.stats ? <p className="pt-4 text-center text-cream-50/70">No stats yet.</p> : (
              <>
                {/* Year + Event stay pinned while the stat columns scroll sideways. */}
                <div className="-mx-4 overflow-x-auto">
                  <table className="min-w-full whitespace-nowrap text-sm">
                    <thead><tr className="font-condensed uppercase tracking-wide text-cream-50/60">
                      <th className={`${STICKY_YEAR} py-2 text-left font-semibold`}>Year</th>
                      <th className={`${STICKY_EVENT} py-2 text-left font-semibold`}>Event</th>
                      {profile.stats.columns.map((c) => <th key={c} className="px-3 py-2 text-right font-semibold">{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {profile.stats.rows.map((r) => (
                        <tr key={r.year} className="border-t border-cream-50/10">
                          <th scope="row" className={`${STICKY_YEAR} py-2 text-left font-semibold tabular-nums`}>{r.year}</th>
                          <td className={`${STICKY_EVENT} py-2 text-left`}>{r.event}</td>
                          {r.values.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v ?? "—"}</td>)}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gold-400/60 font-semibold text-gold-300">
                        <th scope="row" className={`${STICKY_YEAR} py-2 text-left font-condensed uppercase tracking-wide`}>Total</th>
                        <td className={`${STICKY_EVENT} py-2`} />
                        {profile.stats.totals.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v ?? "—"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-6"><CareerGlance yearStats={profile.stats.played} tone="dark" /></div>
              </>
            )}
          </section>
        )}

        {tab === "about" && (
          <section aria-label="About">
            {profile.bio ? <p className="whitespace-pre-line leading-relaxed text-cream-50/90">{profile.bio}</p>
              : <p className="text-center text-cream-50/70">No bio yet.</p>}
          </section>
        )}
      </main>
    </div>
  );
}

function TournamentList({ rows, empty }: { rows: PastTournament[]; empty: React.ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-cream-50/10 rounded-2xl border border-cream-50/15">
      {rows.map((t) => (
        <li key={`${t.href}-${t.year}`}>
          <Link href={t.href} className="flex items-center gap-3 px-4 py-3">
            <Flag size={20} aria-hidden="true" className="shrink-0 text-gold-300" />
            <span className="min-w-0 flex-1">
              <strong className="block break-words">{t.name} {t.year}</strong>
              {t.destination && <span className="block text-sm text-cream-50/70">{t.destination}</span>}
              {t.startDate && <span className="block text-sm text-cream-50/70">{formatDateRange(t.startDate, t.endDate)}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
