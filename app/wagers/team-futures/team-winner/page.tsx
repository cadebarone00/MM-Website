"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { teamWinnerOdds } from "@/lib/wagers/mockOdds";
import { MarketSelectionList } from "@/components/wagers/MarketSelectionList";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";

export default function TeamWinnerPage() {
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

  const odds = teamWinnerOdds(tournament);

  return (
    <div className="px-4 pt-5 sm:px-7">
      <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Team Winner</h2>
      <div className="mt-4">
        <MarketSelectionList
          selections={[
            { key: "maroon", label: "Maroon wins the tournament", odds: odds.maroon },
            { key: "white", label: "White wins the tournament", odds: odds.white },
          ]}
        />
      </div>
    </div>
  );
}
