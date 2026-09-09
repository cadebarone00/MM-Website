"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Team } from "@/lib/data";
import type { ArchivedHandicapRound, HandicapSummary } from "@/lib/handicap/types";
import { handicapHistory } from "@/lib/handicap/history";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HandicapHome({ playerName, summary, archivedRounds, team }: { playerName: string; summary: HandicapSummary; archivedRounds: ArchivedHandicapRound[]; team: Team | null }) {
  const [activeTab, setActiveTab] = useState<"maroon-masters" | "overall">("maroon-masters");
  const rounds = handicapHistory(archivedRounds, summary.rounds, activeTab);
  const index = activeTab === "overall" ? summary.index : null;
  const lowIndex = activeTab === "overall" ? summary.lowIndex : null;
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
            <p className="mt-1 font-serif text-4xl font-bold leading-none">{index != null ? index.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Handicap Index</p>
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
        <h2 className="font-serif text-xl font-bold text-ink-900">Scores</h2>
        {archivedRounds.length > 0 && <p className="mt-2 font-sans text-xs text-ink-500">Archived scores appear below. They will count toward the handicap index once their historical tee ratings and slopes are available.</p>}
        {rounds.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-ink-500">{activeTab === "maroon-masters" ? "No archived Maroon Masters rounds yet." : "No rounds yet — submit your first score above."}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {rounds.map((entry) => entry.source === "archive" ? (
              <article key={`archive-${entry.round.id}`} className="rounded-lg border border-stone-300 bg-white p-4">
                <p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">{entry.round.tournamentLabel} · Round {entry.round.round}</p>
                <h3 className="mt-1 font-serif text-base font-bold text-ink-900">{entry.round.courseName}</h3>
                {entry.round.format && <p className="mt-0.5 font-sans text-xs text-ink-500">{entry.round.format}</p>}
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="font-serif text-2xl font-bold text-ink-900">{entry.round.totalScore ?? "—"}</span>
                  <span className="font-sans text-sm text-ink-600">{entry.round.holesPlayed} holes recorded</span>
                </div>
              </article>
            ) : (
              <article key={`submitted-${entry.round.id}`} className="rounded-lg border border-stone-300 bg-white p-4">
                <p className="mb-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">Submitted score</p>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-base font-bold text-ink-900">{entry.round.courseName}</h3>
                    <p className="mt-0.5 font-sans text-xs text-ink-500">{entry.round.teeSetName} · Rating {entry.round.rating} · Slope {entry.round.slope}</p>
                  </div>
                  <p className="font-sans text-xs text-ink-500">{formatDate(entry.round.datePlayed)}</p>
                </div>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="font-serif text-2xl font-bold text-ink-900">{entry.round.totalScore}</span>
                  <span className="font-sans text-sm text-ink-600">Differential {entry.round.differential.toFixed(1)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
