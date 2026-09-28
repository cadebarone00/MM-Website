"use client";

import { getPlayerDisplayName, getPlayerLastName, getPlayerSlug, playerProfiles } from "@/lib/data/players";
import { usePlayerNameMap } from "@/lib/data/players/usePlayerNameMap";
import type { Tournament } from "@/lib/data/types";

const columns = Array.from({ length: 12 }, (_, index) => `Stat ${index + 1}`);

export function PlayerStatsTable({ tournament }: { tournament: Tournament }) {
  const nameBySlug = usePlayerNameMap();
  const names = new Map(playerProfiles.map((player) => [player.slug, player.fullName]));
  for (const player of [...tournament.roster.maroon, ...tournament.roster.white]) {
    names.set(getPlayerSlug(player), getPlayerDisplayName(player));
  }
  for (const [slug, name] of Object.entries(nameBySlug)) names.set(getPlayerSlug(slug), name);
  const players = [...names].sort((a, b) => a[1].localeCompare(b[1]));
  const maroon = new Set(tournament.roster.maroon.map(getPlayerSlug));

  return (
    <div role="region" aria-label="Player stats, scroll horizontally for more columns" tabIndex={0}
      className="-mx-7 overflow-x-auto lg:mx-0 lg:rounded-lg lg:border lg:border-gold-400 lg:shadow-lg">
      <table className="w-full min-w-max border-collapse bg-cream-50">
        <caption className="sr-only">All players. Stat columns are placeholders; values are not available yet.</caption>
        <thead>
          <tr className="bg-maroon-700 lg:border-b lg:border-gold-200 lg:bg-transparent">
            <th scope="col" className="sticky left-0 z-10 min-w-33 bg-maroon-700 py-2 pl-3 pr-3 text-left font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:bg-cream-50 lg:text-ink-400">Player</th>
            {columns.map((column) => (
              <th key={column} scope="col" className="min-w-24 px-2 py-2 text-center font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(([slug, name]) => (
            <tr key={slug} className="border-b border-ink-100 bg-cream-50 last:border-b-0">
              <th scope="row" title={name} className={`sticky left-0 bg-cream-50 py-2 pl-3 pr-3 text-left font-sans text-2xs font-bold uppercase sm:text-xs ${maroon.has(slug) ? "text-maroon-700" : "text-ink-900"}`}>
                <span aria-hidden="true">{getPlayerLastName(name)}</span><span className="sr-only">{name}</span>
              </th>
              {columns.map((column) => (
                <td key={column} className="px-2 py-2 text-center font-sans text-2xs font-semibold tabular-nums text-ink-300"><span aria-hidden="true">—</span><span className="sr-only">Not available</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
