"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { IndividualStanding } from "@/lib/data/types";

function topFive(standings: IndividualStanding[]): IndividualStanding[] {
  return [...standings].sort((a, b) => a.toPar - b.toPar).slice(0, 5);
}

export function QuickLeaderboardCard() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.individualLeaderboard.length > 0;
  const rows = topFive(isLive ? tournament.individualLeaderboard : latestCompleted.individualLeaderboard);

  return (
    <Link
      href="/leaderboard"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:px-4 sm:py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
          <Trophy size={14} />
          Leaderboard
        </div>
        {!isLive && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row, i) => (
          <div key={row.player} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="font-condensed text-3xs font-bold text-ink-400 sm:text-2xs">{i + 1}</span>
              <span className="truncate font-sans font-semibold text-ink-900">{getPlayerDisplayName(row.player)}</span>
            </span>
            <ScoreBadge value={row.toPar} size="sm" />
          </div>
        ))}
      </div>
    </Link>
  );
}
