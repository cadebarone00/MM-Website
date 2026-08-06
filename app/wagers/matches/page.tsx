"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { MatchWagerBox } from "@/components/wagers/MatchWagerBox";

export default function MatchesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));

  return (
    <CategoryPageShell
      rulesText="Pick the winning side of today's match. Odds update as play continues, but a wager locks in the odds shown at the moment you place it."
      searchPlaceholder="Search a player..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const filtered = todaysMatches.filter(
          (match) =>
            term === "" ||
            [...match.maroonPlayers, ...match.whitePlayers].some((player) => getPlayerDisplayName(player).toLowerCase().includes(term))
        );
        if (filtered.length === 0) {
          return (
            <p className="font-sans text-sm text-ink-400">
              {todaysMatches.length === 0 ? "No matches posted yet." : `No matches match “${search}”.`}
            </p>
          );
        }
        return filtered.map((match) => <MatchWagerBox key={match.id} match={match} />);
      }}
    </CategoryPageShell>
  );
}
