"use client";

import { useParams } from "next/navigation";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchWinnerOdds } from "@/lib/wagers/mockOdds";
import { MarketSelectionList } from "@/components/wagers/MarketSelectionList";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export default function MatchWinnerPage() {
  const { matchId } = useParams<{ matchId: string }>();
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

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Match not found.</p>;
  }

  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);

  return (
    <div className="px-4 pt-5 sm:px-7">
      <h2 className="m-0 font-serif text-xl font-bold text-ink-900">
        {maroonLabel} vs {whiteLabel}
      </h2>
      <div className="mt-4">
        <MarketSelectionList
          selections={[
            { key: "maroon", label: `${maroonLabel} wins the match`, odds: odds.maroon },
            { key: "white", label: `${whiteLabel} wins the match`, odds: odds.white },
          ]}
        />
      </div>
    </div>
  );
}
