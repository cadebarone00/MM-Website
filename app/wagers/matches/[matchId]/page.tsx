"use client";

import { useParams } from "next/navigation";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { usePlayerNameMap } from "@/lib/data/players/usePlayerNameMap";
import { matchWinnerMarket } from "@/lib/wagers/marketKeys";
import { MarketSelectionList } from "@/components/wagers/MarketSelectionList";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";

function sideLabel(players: string[], nameBySlug: Record<string, string>): string {
  return players.map((p) => (nameBySlug[p] ?? getPlayerDisplayName(p)).split(" ").pop()).join(" & ");
}

export default function MatchWinnerPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const nameBySlug = usePlayerNameMap();
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

  const market = matchWinnerMarket(tournament.slug, match);
  const maroonLabel = sideLabel(match.maroonPlayers, nameBySlug);
  const whiteLabel = sideLabel(match.whitePlayers, nameBySlug);

  return (
    <div className="px-4 pt-5 sm:px-7">
      <h2 className="m-0 font-serif text-xl font-bold text-ink-900">
        {maroonLabel} vs {whiteLabel}
      </h2>
      <div className="mt-4">
        <MarketSelectionList
          selections={market.selections.map((selection) => ({ ...selection, marketKey: market.marketKey }))}
        />
      </div>
    </div>
  );
}
