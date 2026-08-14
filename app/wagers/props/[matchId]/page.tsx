"use client";

import { useParams } from "next/navigation";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { propMarket } from "@/lib/wagers/marketKeys";
import { MarketSelectionList } from "@/components/wagers/MarketSelectionList";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export default function MatchPropsPage() {
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

  // Each prop is its own market (its own marketKey) with two selections — over and under.
  const selections = matchPropMarkets(match).flatMap((prop) => {
    const market = propMarket(tournament.slug, match.day, prop);
    return market.selections.map((selection) => ({ ...selection, marketKey: market.marketKey }));
  });

  return (
    <div className="px-4 pt-5 sm:px-7">
      <h2 className="m-0 font-serif text-xl font-bold text-ink-900">
        {sideLabel(match.maroonPlayers)} vs {sideLabel(match.whitePlayers)} — Props
      </h2>
      <div className="mt-4">
        <MarketSelectionList searchPlaceholder="Search a player..." selections={selections} />
      </div>
    </div>
  );
}
