"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerScorecardView } from "./PlayerScorecardView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";
import type { Team } from "@/lib/data/types";

export function LivePlayerScorecard({ tournamentSlug, player }: { tournamentSlug: string; player: string }) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const team: Team = tournament.roster.maroon.some((n) => n.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
  const displayName =
    [...tournament.roster.maroon, ...tournament.roster.white].find((n) => n.toLowerCase() === player.toLowerCase()) ?? player;
  const scorecard = tournament.scorecards?.find((s) => s.player.toLowerCase() === player.toLowerCase());

  return (
    <div>
      <Link
        href={`/leaderboard/${tournamentSlug}`}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        &larr; Back to {nextTournament.editionLabel} Leaderboard
      </Link>

      <div className="flex items-center gap-4 mt-4 mb-6">
        <Avatar name={displayName} size="lg" team={team} />
        <div>
          <h1 className="font-sans text-[32px] font-extrabold text-ink-900 m-0">{displayName}</h1>
          <span className={["font-condensed text-xs font-semibold tracking-wide uppercase", team === "maroon" ? "text-maroon-600" : "text-ink-500"].join(" ")}>
            {team === "maroon" ? "Team Maroon" : "Team White"} &middot; {nextTournament.editionLabel}
          </span>
        </div>
      </div>

      {scorecard && scorecard.rounds.length > 0 ? (
        <PlayerScorecardView scorecard={scorecard} tournamentSlug={tournamentSlug} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">No rounds posted for {displayName} yet - check back once play begins.</p>
        </div>
      )}
    </div>
  );
}
