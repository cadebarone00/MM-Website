"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { CareerPlayerStat } from "@/lib/data/careerStats";

function percentage(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "—";
}

export function CareerStatsPanel({ players }: { players: CareerPlayerStat[] }) {
  const [view, setView] = useState("overview");

  if (players.length === 0) {
    return <p className="rounded-md border border-gold-300 bg-cream-50 px-4 py-5 font-sans text-sm text-ink-500">No archived scorecards are available yet. Once Tiger saves historical or completed rounds, the career tables will build automatically from those records.</p>;
  }

  return (
    <div>
      <Tabs
        items={[
          { value: "overview", label: "Overview" },
          { value: "scoring", label: "Scoring" },
          { value: "trends", label: "Trends" },
        ]}
        value={view}
        onChange={setView}
        variant="plain"
      />
      <div className="mt-5 overflow-x-auto rounded-md border border-gold-300 bg-white">
        {view === "overview" && (
          <table className="min-w-full text-left font-sans text-xs">
            <thead className="bg-cream-100 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2">Years</th><th className="px-3 py-2">Rounds</th><th className="px-3 py-2">Avg.</th><th className="px-3 py-2">Best</th><th className="px-3 py-2">Worst</th></tr></thead>
            <tbody>{players.map((player) => <tr key={player.player} className="border-t border-gold-100"><td className="px-3 py-2 font-semibold text-ink-900">{getPlayerDisplayName(player.player)}</td><td className="px-3 py-2">{player.years.join(", ")}</td><td className="px-3 py-2">{player.rounds}</td><td className="px-3 py-2 font-semibold">{player.averageRound.toFixed(2)}</td><td className="px-3 py-2">{player.bestRound}</td><td className="px-3 py-2">{player.worstRound}</td></tr>)}</tbody>
          </table>
        )}
        {view === "scoring" && (
          <table className="min-w-full text-left font-sans text-xs">
            <thead className="bg-cream-100 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2">Birdies</th><th className="px-3 py-2">Birdie %</th><th className="px-3 py-2">Pars</th><th className="px-3 py-2">Bogeys</th><th className="px-3 py-2">Dbl.+</th></tr></thead>
            <tbody>{players.map((player) => <tr key={player.player} className="border-t border-gold-100"><td className="px-3 py-2 font-semibold text-ink-900">{getPlayerDisplayName(player.player)}</td><td className="px-3 py-2">{player.birdies}</td><td className="px-3 py-2">{percentage(player.birdies, player.holes)}</td><td className="px-3 py-2">{player.pars}</td><td className="px-3 py-2">{player.bogeys}</td><td className="px-3 py-2">{player.doublesOrWorse}</td></tr>)}</tbody>
          </table>
        )}
        {view === "trends" && (
          <table className="min-w-full text-left font-sans text-xs">
            <thead className="bg-cream-100 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Rounds</th><th className="px-3 py-2">Avg. Round</th><th className="px-3 py-2">Avg. Hole</th></tr></thead>
            <tbody>{players.flatMap((player) => player.byYear.map((year) => <tr key={`${player.player}-${year.year}`} className="border-t border-gold-100"><td className="px-3 py-2 font-semibold text-ink-900">{getPlayerDisplayName(player.player)}</td><td className="px-3 py-2">{year.year}</td><td className="px-3 py-2">{year.rounds}</td><td className="px-3 py-2">{year.averageRound.toFixed(2)}</td><td className="px-3 py-2">{year.averageHole.toFixed(3)}</td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
