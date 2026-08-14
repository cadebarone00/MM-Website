"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { tournamentWinnerLadder } from "@/lib/wagers/mockOdds";
import { MarketSelectionList } from "@/components/wagers/MarketSelectionList";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";

export default function TournamentWinnerPage() {
  const { tournament, loading, payload } = useLiveTournament();
  const { mode } = useWagersMode();

  if (mode === "real") {
    return (
      <div className="px-4 pt-5 sm:px-7">
        <ComingSoonNotice />
      </div>
    );
  }

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const ladder = tournamentWinnerLadder(tournament.individualLeaderboard);

  return (
    <div className="px-4 pt-5 sm:px-7">
      <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Tournament Winner</h2>
      <div className="mt-4">
        {ladder.length === 0 ? (
          <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>
        ) : (
          <MarketSelectionList
            searchPlaceholder="Search a player..."
            selections={ladder.map((entry) => ({
              key: entry.player,
              label: `${getPlayerDisplayName(entry.player)} wins the tournament`,
              odds: entry.odds,
            }))}
          />
        )}
      </div>
    </div>
  );
}
