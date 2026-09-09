"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Team } from "@/lib/data";
import type { ArchivedHandicapRound, HandicapSummary } from "@/lib/handicap/types";
import { handicapHistory, selectHandicapScores, type ScoreView } from "@/lib/handicap/history";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HandicapHome({ playerName, summary, archivedRounds, team }: { playerName: string; summary: HandicapSummary; archivedRounds: ArchivedHandicapRound[]; team: Team | null }) {
  const [activeTab, setActiveTab] = useState<"maroon-masters" | "overall">("maroon-masters");
  const [scoreView, setScoreView] = useState<ScoreView>("recent");
  const rounds = selectHandicapScores(handicapHistory(archivedRounds, summary.rounds, activeTab), scoreView);
  const index = summary.index;
  const lowIndex = summary.lowIndex;
  return (
    <main className="w-full pb-10">
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className={`absolute inset-0 bg-gradient-to-t ${team === "white" ? "from-maroon-950/95 via-maroon-900/65 to-maroon-950/50" : "from-maroon-950/90 via-maroon-950/40 to-maroon-950/35"}`} />
        </div>
        <div className="absolute right-4 top-4 flex flex-col items-end gap-3 text-white sm:right-6 sm:top-6">
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">My Handicap</h1>
          <Link href="/portal/handicap/new" className="rounded-lg border border-white/30 bg-maroon-700 px-4 py-2.5 font-condensed text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-maroon-800 sm:text-sm">
            Submit a score
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-6">
          <div>
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">{playerName}</p>
            <div className="mt-2 flex items-end gap-4 sm:gap-6">
              <div>
                <p className="font-serif text-4xl font-bold leading-none">{index != null ? index.toFixed(1) : "—"}</p>
                <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Overall Handicap</p>
              </div>
              <div className="text-stone-300" title="Maroon Masters handicap will be available once archived rounds have the required tee data.">
                <p className="font-serif text-2xl font-bold leading-none">—</p>
                <p className="mt-1 font-condensed text-[10px] font-semibold uppercase tracking-wide">Maroon Masters</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="font-serif text-xl font-bold leading-none">{lowIndex != null ? lowIndex.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Low Index</p>
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

      <section id="handicap-scores" role="tabpanel" aria-labelledby={`handicap-tab-${activeTab}`} className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <h2 className="font-condensed text-sm font-bold text-maroon-700">Scores —</h2>
          <select aria-label="Score display order" value={scoreView} onChange={(event) => setScoreView(event.target.value as ScoreView)} className="min-w-0 rounded bg-transparent py-2 pr-2 font-condensed text-sm font-bold text-maroon-700 focus-visible:outline-2 focus-visible:outline-maroon-700">
            <option value="recent">20 Most Recent</option>
            <option value="all">All Scores</option>
            <option value="highest">Highest to Lowest</option>
            <option value="lowest">Lowest to Highest</option>
          </select>
        </div>
        {archivedRounds.length > 0 && <p className="mt-2 font-sans text-xs text-ink-500">Archived scores appear below. They will count toward the handicap index once their historical tee ratings and slopes are available.</p>}
        {rounds.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-ink-500">{activeTab === "maroon-masters" ? "No archived Maroon Masters rounds yet." : "No rounds yet — submit your first score above."}</p>
        ) : (
          <div className="mt-3 divide-y divide-stone-200 border-y border-stone-200 bg-white">
            {rounds.map((entry) => (
              <article key={`${entry.source}-${entry.round.id}`} className="grid grid-cols-[56px_minmax(0,1fr)_76px] items-center gap-3 py-3 pr-2 sm:grid-cols-[72px_minmax(0,1fr)_100px]">
                <div className="border-r border-stone-200 px-1 text-center">
                  <p className="font-sans text-2xl font-medium tabular-nums text-maroon-700">{entry.round.totalScore ?? "—"}</p>
                  <p className="mt-0.5 font-sans text-[10px] text-ink-500">{entry.source === "archive" ? entry.round.holesPlayed : 18} holes</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-sans text-xs text-ink-600">{entry.source === "submitted" ? formatDate(entry.round.datePlayed) : `${entry.round.tournamentLabel} · Round ${entry.round.round}`}</p>
                  <h3 title={entry.round.courseName} className="mt-1 truncate font-sans text-sm font-semibold text-ink-900">{entry.round.courseName}</h3>
                  <p className="mt-0.5 truncate font-sans text-xs text-ink-500">{entry.source === "submitted" ? entry.round.teeSetName : entry.round.format}</p>
                </div>
                <div className="text-right font-sans text-xs tabular-nums">
                  <p aria-label="Course rating and slope" className="text-maroon-700">{entry.source === "submitted" ? `${entry.round.rating}/${entry.round.slope}` : "— / —"}</p>
                  <p className="mt-1 text-[10px] text-ink-500">{entry.source === "submitted" ? `Diff. ${entry.round.differential.toFixed(1)}` : "Rating / slope"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
