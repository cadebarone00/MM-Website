"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

export function QuickTeamsCard() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.roster.maroon.length > 0 && tournament.roster.white.length > 0;
  const source = isLive ? tournament : latestCompleted;

  return (
    <Link
      href="/teams"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:px-4 sm:py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
          <Shield size={14} />
          Teams
        </div>
        {!isLive && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year}</span>
        )}
      </div>
      <div className="text-center font-condensed text-sm font-black tabular-nums text-ink-900 sm:text-lg">
        {fmtPt(source.maroonPts)}&ndash;{fmtPt(source.whitePts)}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-maroon-700">Maroon</span>
          {source.roster.maroon.map((player) => (
            <span key={player} className="truncate font-sans text-2xs text-ink-800 sm:text-xs">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 border-l border-ink-100 pl-2">
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-500">White</span>
          {source.roster.white.map((player) => (
            <span key={player} className="truncate font-sans text-2xs text-ink-800 sm:text-xs">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
