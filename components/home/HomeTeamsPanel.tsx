"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";

/**
 * Home screen "Teams" tab: the confirmed 2027 roster, styled to match the
 * Match Play tab's maroon/white split header — Maroon hugging the left,
 * White hugging the right. Stands in for real match rows until 2027 play
 * actually begins, at which point this should switch to showing the
 * live Match Play board itself.
 */
export function HomeTeamsPanel() {
  const { tournament } = useLiveTournament();
  const { maroon, white } = tournament.roster;

  if (maroon.length === 0 && white.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
        <p className="m-0 font-sans text-sm text-ink-500">Rosters haven&rsquo;t been confirmed yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex overflow-hidden rounded-sm">
        <div className="flex-1 bg-maroon-700 py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-white">Maroon</div>
        <div className="flex-1 border-y border-ink-100 bg-white py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-maroon-700">
          White
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div className="flex flex-col items-end border-r border-ink-100 pr-3">
          {maroon.map((player) => (
            <span key={player} className="w-full truncate py-1.5 text-right font-sans text-sm font-semibold text-ink-900">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
        <div className="flex flex-col items-start pl-3">
          {white.map((player) => (
            <span key={player} className="w-full truncate py-1.5 text-left font-sans text-sm font-semibold text-ink-900">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
