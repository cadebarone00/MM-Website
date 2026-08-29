"use client";

import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { PlayerScorecardView } from "./PlayerScorecardView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament, isLiveNow } from "@/lib/data";
import { getPlayerAvatar, getPlayerProfile } from "@/lib/data/players";
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
  const profile = getPlayerProfile(player);

  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => p.player.toLowerCase() === player.toLowerCase());
  const position = standing ? ranked.indexOf(standing) + 1 : null;
  const total = standing?.toPar ?? null;
  const lastRound = scorecard?.rounds[scorecard.rounds.length - 1];
  const playedCount = lastRound?.holes.filter((h) => h.score > 0).length ?? 0;
  const thru = lastRound == null ? null : playedCount >= lastRound.holes.length ? "F" : String(playedCount);

  return (
    <div>
      <PlayerProfileHeader
        backHref={`/leaderboard/${tournamentSlug}`}
        backLabel={`Back to ${nextTournament.editionLabel} Leaderboard`}
        displayName={displayName}
        avatarSrc={getPlayerAvatar(player)}
        team={team}
        editionLabel={nextTournament.editionLabel}
        bio={profile?.bio ?? null}
        bioHref={`/teams/stats/players/${player.toLowerCase()}`}
        live={isLiveNow()}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard && scorecard.rounds.length > 0 ? (
        <PlayerScorecardView scorecard={scorecard} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">No rounds posted for {displayName} yet - check back once play begins.</p>
        </div>
      )}
    </div>
  );
}
