"use client";

import { MatchBreakdownView } from "./MatchBreakdownView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";

export function LiveMatchBreakdown({ tournamentSlug, matchId }: { tournamentSlug: string; matchId: string }) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) {
    return (
      <p className="font-sans text-sm text-ink-400 py-10 text-center">
        This match hasn&rsquo;t posted yet — check back once it&rsquo;s live.
      </p>
    );
  }

  return <MatchBreakdownView tournamentSlug={tournamentSlug} editionLabel={nextTournament.editionLabel} match={match} />;
}
