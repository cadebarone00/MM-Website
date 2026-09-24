"use client";

import { useState } from "react";
import Image from "next/image";
import type { Team } from "@/lib/data";
import type { ArchivedHandicapRound, HandicapSummary } from "@/lib/handicap/types";
import { handicapHistory, selectHandicapScores, type ScoreView } from "@/lib/handicap/history";
import { archivedDifferential, contributingRoundIds } from "@/lib/handicap/archiveIndex";
import { calculateDifferential } from "@/lib/handicap/whs";
import { formatDifferential, formatHandicapIndex, formatRoundDate } from "@/lib/handicap/format";
import { formatRoundLabel } from "@/lib/data/roundLabel";
import { RoundInProgressCard } from "./RoundInProgressCard";
import { SubmitScoreButton } from "./SubmitScoreButton";

export function HandicapHome({ playerName, playerSlug, summary, archivedRounds, team, initialTab = "maroon-masters" }: { playerName: string; playerSlug: string; initialTab?: "maroon-masters" | "overall"; summary: HandicapSummary; archivedRounds: ArchivedHandicapRound[]; team: Team | null }) {
  const [activeTab, setActiveTab] = useState<"maroon-masters" | "overall">(initialTab);
  const [scoreView, setScoreView] = useState<ScoreView>("recent");
  const rounds = selectHandicapScores(handicapHistory(archivedRounds, summary.rounds, activeTab), scoreView);
  const contributing = contributingRoundIds(summary.rounds, archivedRounds, activeTab);
  const index = summary.index;
  return (
    <main className="w-full pb-10">
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className={`absolute inset-0 bg-gradient-to-t ${team === "white" ? "from-maroon-950/95 via-maroon-900/65 to-maroon-950/50" : "from-maroon-950/90 via-maroon-950/40 to-maroon-950/35"}`} />
        </div>
        <div className="absolute right-4 top-4 flex flex-col items-end gap-3 text-white sm:right-6 sm:top-6">
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">My Handicap</h1>
          <SubmitScoreButton playerSlug={playerSlug} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-6">
          <div>
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">{playerName}</p>
            <div className="mt-2 flex items-end gap-4 sm:gap-6">
              <div>
                <p className="font-serif text-4xl font-bold leading-none">{formatHandicapIndex(index)}</p>
                <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Overall Handicap</p>
              </div>
              <div className={summary.maroonMastersIndex == null ? "text-stone-300" : undefined} title={summary.maroonMastersIndex == null ? "Maroon Masters handicap will be available once archived rounds have the required tee data." : undefined}>
                <p className="font-serif text-2xl font-bold leading-none">{formatHandicapIndex(summary.maroonMastersIndex)}</p>
                <p className="mt-1 font-condensed text-[10px] font-semibold uppercase tracking-wide">Maroon Masters</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[720px] px-4 pt-6 sm:px-7 sm:pt-8">
        <div className="flex justify-center border-b border-ink-200" role="tablist" aria-label="Handicap scores">
          {([{ id: "maroon-masters", label: "Maroon Masters" }, { id: "overall", label: "Overall" }] as const).map((tab) => (
            <button key={tab.id} id={`handicap-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls="handicap-scores" onClick={() => setActiveTab(tab.id)} className={`relative px-5 pb-3 font-condensed text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === tab.id ? "text-maroon-700" : "text-ink-400 hover:text-ink-700"}`}>
              {tab.label}
              {activeTab === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
            </button>
          ))}
        </div>
      </section>

      <RoundInProgressCard playerSlug={playerSlug} />

      <section id="handicap-scores" role="tabpanel" aria-labelledby={`handicap-tab-${activeTab}`} className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <select aria-label="Score display order" value={scoreView} onChange={(event) => setScoreView(event.target.value as ScoreView)} className="min-w-0 rounded bg-transparent py-2 pr-2 font-condensed text-sm font-bold text-maroon-700 focus-visible:outline-2 focus-visible:outline-maroon-700">
            <option value="recent">20 Most Recent</option>
            <option value="all">All Scores</option>
            <option value="highest">Highest to Lowest</option>
            <option value="lowest">Lowest to Highest</option>
          </select>
        </div>
        {rounds.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-ink-500">{activeTab === "maroon-masters" ? "No archived Maroon Masters rounds yet." : "No rounds yet — submit your first score above."}</p>
        ) : (
          <div className="mt-3 divide-y divide-stone-200 border-y border-stone-200 bg-white">
            {rounds.map((entry) => {
              const differential = entry.source === "archive" ? archivedDifferential(entry.round) : calculateDifferential(entry.round.totalScore, entry.round.rating, entry.round.slope);
              return (
              <article key={`${entry.source}-${entry.round.id}`} className="grid grid-cols-[42px_50px_minmax(0,1fr)_70px] items-center gap-1.5 py-3 pr-2 sm:grid-cols-[60px_64px_minmax(0,1fr)_90px]">
                <div className="border-r border-stone-200 px-1 text-center">
                  <p className="font-sans text-2xl font-medium tabular-nums text-maroon-700">{entry.round.totalScore ?? "—"}</p>
                </div>
                <div className="text-center font-sans text-lg font-medium tabular-nums text-maroon-700" aria-label="Score differential">
                  {formatDifferential(differential)}{contributing.has(entry.source + "-" + entry.round.id) && <sup className="ml-0.5 text-xs" aria-label="Used in handicap calculation">*</sup>}
                </div>
                <div className="min-w-0 pl-1">
                  <p className="truncate font-sans text-xs text-ink-600">{entry.source === "submitted" ? formatRoundDate(entry.round.datePlayed) : `${entry.round.tournamentLabel} · ${formatRoundLabel(entry.round.round)}`}</p>
                  <h3 title={entry.round.courseName} className="mt-1 truncate font-sans text-sm font-semibold text-ink-900">{entry.round.courseName}</h3>
                  <p className="mt-0.5 truncate font-sans text-xs text-ink-500">{entry.source === "submitted" ? entry.round.teeSetName : entry.round.teeSetup?.teeSetName ?? entry.round.format}</p>
                </div>
                <div className="border-l border-stone-200 pl-2 text-right font-sans text-xs tabular-nums">
                  <p aria-label="Course rating and slope" className="text-maroon-700">
                    {entry.source === "submitted"
                      ? `${entry.round.rating}/${entry.round.slope}`
                      : entry.round.teeSetup?.rating != null && entry.round.teeSetup?.slope != null
                        ? `${entry.round.teeSetup.rating}/${entry.round.teeSetup.slope}`
                        : "— / —"}
                  </p>
                </div>
              </article>
            ); })}
          </div>
        )}
      </section>
    </main>
  );
}
