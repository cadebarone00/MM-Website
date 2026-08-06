"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { FuturesLadder } from "@/components/wagers/FuturesLadder";

export default function PlayerFuturesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  return (
    <CategoryPageShell
      rulesText="Pick who wins the tournament outright. A wager locks in the odds shown at the moment you place it; payouts use standard American odds."
      searchPlaceholder="Search a player..."
    >
      {(search) => <FuturesLadder standings={tournament.individualLeaderboard} search={search} />}
    </CategoryPageShell>
  );
}
