"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArchivedHandicapRound, HandicapSummary } from "@/lib/handicap/types";
import { formatHandicapIndex } from "@/lib/handicap/format";
import { HandicapHome } from "./handicap/HandicapHome";
import { CareerArchiveStats } from "@/components/scorecard/CareerArchiveStats";

export function PlayerLookup({ players, selected, viewer, summary, archivedRounds }: {
  players: { playerSlug: string; fullName: string }[]; selected: string; viewer: string; summary: HandicapSummary; archivedRounds: ArchivedHandicapRound[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"maroon-masters" | "overall" | "statistics">("maroon-masters");
  const name = players.find(player => player.playerSlug === selected)?.fullName ?? selected;
  const selectClass = "w-full rounded-md border border-gold-300 bg-white px-4 py-3 font-condensed text-base font-bold text-maroon-700";
  return <main aria-label="Player Lookup" className="mx-auto max-w-4xl px-4 pt-3 pb-6 sm:px-6">
    <label className="block"><span className="sr-only">Select player</span><select aria-label="Select player" className={selectClass} value={selected} disabled={pending} onChange={event => { const slug = event.target.value; startTransition(() => router.replace(`/portal/player-lookup?player=${encodeURIComponent(slug)}`)); }}>{players.map(player => <option key={player.playerSlug} value={player.playerSlug}>{player.fullName}</option>)}</select></label>
    {pending && <p role="status" className="mt-2 text-sm">Loading player…</p>}
    <div className="my-6 grid grid-cols-2 gap-4 rounded-md bg-maroon-900 p-5 text-white">
      <div><p className="text-xs">Maroon Masters Handicap</p><p className="mt-2 font-serif text-4xl">{formatHandicapIndex(summary.maroonMastersIndex ?? null)}</p></div>
      <div className="text-right"><p className="text-xs">Overall Handicap</p><p className="mt-2 font-serif text-4xl">{formatHandicapIndex(summary.index)}</p></div>
    </div>
    <select aria-label="Player lookup section" className={selectClass} value={view} onChange={event => setView(event.target.value as typeof view)}><option value="maroon-masters">Maroon Masters</option><option value="overall">Overall</option><option value="statistics">Statistics</option></select>
    {view === "statistics" ? <CareerArchiveStats key={selected} playerSlug={selected} initialCompare={viewer} /> : <HandicapHome key={`${selected}:${view}`} playerName={name} playerSlug={selected} summary={summary} archivedRounds={archivedRounds} team={null} initialTab={view} readOnly />}
  </main>;
}
