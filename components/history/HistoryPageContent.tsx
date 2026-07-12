"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ChampionCard } from "@/components/history/ChampionCard";
import { CupSection } from "@/components/recap/CupSection";
import { MatchesSection } from "@/components/recap/MatchesSection";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { SectionHead } from "@/components/home/SectionHead";
import { champion, latestCompleted, pastTournaments } from "@/lib/data";

const champions = [...pastTournaments]
  .sort((a, b) => b.year - a.year)
  .filter((t) => t.individualChampion)
  .map((t) => ({ year: t.year, playerId: t.individualChampion as string, photo: t.individualChampionPhoto ?? null }));

const pastYearsDescending = [...pastTournaments].sort((a, b) => b.year - a.year);

function YearDropdown({ value, onChange }: { value: number; onChange: (year: number) => void }) {
  return (
    <div className="group relative z-30 inline-block">
      <button
        type="button"
        className="inline-flex min-h-[54px] min-w-[118px] items-center justify-between gap-3 rounded-sm border border-ink-300 bg-white px-6 font-condensed text-lg font-bold uppercase tracking-wide text-maroon-700 shadow-sm transition-colors hover:border-maroon-400 hover:bg-maroon-50"
      >
        {value}
        <ChevronDown size={18} />
      </button>
      <div className="invisible absolute right-0 top-full w-[160px] pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-md border border-ink-100 bg-white shadow-lg">
          {pastYearsDescending.map((t) => {
            const active = t.year === value;
            return (
              <button
                key={t.year}
                type="button"
                onClick={() => onChange(t.year)}
                className={[
                  "block w-full border-b border-ink-100 px-4 py-3 text-left font-condensed text-xs font-semibold uppercase tracking-wide last:border-b-0 transition-colors",
                  active ? "bg-maroon-50 text-maroon-700" : "text-ink-700 hover:bg-cream-50",
                ].join(" ")}
              >
                {t.year}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HistoryPageContent() {
  const [year, setYear] = useState(latestCompleted.year);
  const selected = pastYearsDescending.find((t) => t.year === year) ?? latestCompleted;
  const winnerText = champion(selected) === "maroon" ? "Maroon Wins" : "White Wins";

  return (
    <div className="mx-auto max-w-[1360px] px-7 py-8">
      <div className="grid gap-9 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
        <div className="flex flex-col">
          <div className="mb-5 border-b-2 border-ink-900 pb-4">
            <div className="font-condensed text-[11px] font-bold uppercase tracking-eyebrow text-gold-700">Hall of Fame</div>
            <h2 className="m-0 font-sans text-3xl font-black text-ink-900">Maroon Masters Champions</h2>
          </div>
          {champions.map((c) => (
            <ChampionCard key={c.year} year={c.year} playerId={c.playerId} photo={c.photo} />
          ))}
          <Link
            href="/teams/stats"
            className="mt-auto flex items-center justify-between rounded-lg border-2 border-gold-400 bg-gradient-to-r from-maroon-800 via-maroon-700 to-maroon-600 px-8 py-7 shadow-[0_0_16px_rgba(201,168,110,0.4)] transition-shadow hover:shadow-[0_0_24px_rgba(201,168,110,0.6)]"
          >
            <span className="font-sans text-2xl font-black uppercase tracking-wide text-cream-50">Dive Into All the Statistics</span>
            <ArrowRight className="text-gold-200" size={28} />
          </Link>
        </div>

        <div>
          <div className="mb-5 flex items-end justify-between gap-3">
            <div className="font-condensed text-[11px] font-bold uppercase tracking-eyebrow text-gold-700">Past Results</div>
            <YearDropdown value={year} onChange={setYear} />
          </div>
          <CupSection tournament={selected} isLive={false} large winnerText={winnerText} />
          <div className="mt-9">
            <MatchesSection tournament={selected} isLive={false} />
          </div>
          <section className="mt-9">
            <SectionHead eyebrow="Standings" title={`${selected.year} Leaderboard`} action="Full board" actionHref={`/leaderboard/${selected.slug}`} />
            <LeaderboardTable tournament={selected} />
          </section>
        </div>
      </div>
    </div>
  );
}
