"use client";

import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { PlayerScorecardView } from "./PlayerScorecardView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament, isLiveNow } from "@/lib/data";
import { getPlayerSlug, getPlayerDisplayName, getPlayerAvatar, getPlayerProfile } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import { placementValueLabel } from "@/lib/leaderboard/placement";

export function LivePlayerScorecard({ tournamentSlug, player }: { tournamentSlug: string; player: string }) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const team: Team = tournament.roster.maroon.some((n) => getPlayerSlug(n) === getPlayerSlug(player)) ? "maroon" : "white";
  const displayName = getPlayerDisplayName(player);
  const scorecard = tournament.scorecards?.find((s) => getPlayerSlug(s.player) === getPlayerSlug(player));
  const profile = getPlayerProfile(player);

  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => getPlayerSlug(p.player) === getPlayerSlug(player));
  const position = standing ? placementValueLabel(ranked, ranked.indexOf(standing)) : null;
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
        live={isLiveNow()}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard && scorecard.rounds.length > 0 ? (
        <PlayerScorecardView scorecard={scorecard} tournament={tournament} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">No rounds posted for {displayName} yet - check back once play begins.</p>
        </div>
      )}
    </div>
  );
}
