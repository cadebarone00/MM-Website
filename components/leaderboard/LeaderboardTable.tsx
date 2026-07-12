"use client";

import { Fragment, useState } from "react";
import { LeaderboardRow } from "@/components/ui/LeaderboardRow";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import { defendingIndividualChampion, getPlayerScorecard } from "@/lib/data";
import type { Tournament, Team } from "@/lib/data/types";

type Filter = "all" | Team;

const filters: [Filter, string][] = [
  ["all", "All Players"],
  ["maroon", "Team Maroon"],
  ["white", "Team White"],
];

export function LeaderboardTable({ tournament }: { tournament: Tournament }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const champion = defendingIndividualChampion(tournament);

  const sorted = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const ranked = sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  const rows = ranked.filter((p) => filter === "all" || p.team === filter);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 sm:gap-2 sm:mb-5">
        {filters.map(([v, l]) => {
          const on = filter === v;
          return (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={[
                "font-sans text-[11px] font-semibold px-3 py-1 rounded-pill border-[1.5px] transition-all duration-150 cursor-pointer sm:text-[13px] sm:px-[18px] sm:py-[7px]",
                on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white text-ink-700",
              ].join(" ")}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div className="bg-cream-50 border border-gold-400 rounded-lg overflow-hidden shadow-lg">
        <LeaderboardRow header />
        {rows.map((p) => {
          const isOpen = expanded === p.player;
          const scorecard = getPlayerScorecard(tournament, p.player);

          return (
            <Fragment key={p.player}>
              <LeaderboardRow
                pos={p.pos}
                name={p.player}
                team={p.team}
                total={p.toPar}
                highlight={p.pos === 1}
                expanded={isOpen}
                onToggle={() => setExpanded(isOpen ? null : p.player)}
                defendingChampion={champion != null && p.player === champion}
                isWinner={tournament.individualChampion === p.player}
              />
              {isOpen && (
                <div className="bg-cream-50 border-b border-ink-100 px-4 py-5">
                  {scorecard ? (
                    <PlayerScorecardView scorecard={scorecard} tournamentSlug={tournament.slug} />
                  ) : (
                    <p className="font-sans text-sm text-ink-500 text-center py-4">
                      Hole-by-hole scorecard detail wasn&rsquo;t reliably recorded in the source data for this tournament and isn&rsquo;t available yet.
                    </p>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <p className="font-sans text-xs text-ink-400 mt-3">
        Total score to par across the tournament. <span className="text-score-under font-semibold">Red</span> = under par ·{" "}
        <span className="text-score-even font-semibold">Green</span> = even ·{" "}
        <span className="text-score-over font-semibold">Black</span> = over par. Click a player to see their round-by-round scorecard.
      </p>
    </div>
  );
}
