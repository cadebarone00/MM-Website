"use client";

import { ListOrdered } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { WagerBox } from "@/components/wagers/WagerBox";
import { PropBetRow } from "@/components/wagers/PropBetRow";

function matchLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export default function PropsPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));

  return (
    <CategoryPageShell
      rulesText="Pick over/under on a specific player's stat for one match. A wager locks in the line and odds shown at the moment you place it."
      searchPlaceholder="Search a player..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const boxes = todaysMatches
          .map((match) => ({
            match,
            markets: matchPropMarkets(match).filter(
              (market) => term === "" || getPlayerDisplayName(market.player).toLowerCase().includes(term)
            ),
          }))
          .filter((entry) => entry.markets.length > 0);

        if (boxes.length === 0) {
          return (
            <p className="font-sans text-sm text-ink-400">
              {todaysMatches.length === 0 ? "No player props posted yet." : `No props match “${search}”.`}
            </p>
          );
        }

        return boxes.map(({ match, markets }) => (
          <WagerBox key={match.id} icon={<ListOrdered size={16} />} title={matchLabel([...match.maroonPlayers, ...match.whitePlayers])}>
            <div className="flex flex-col">
              {markets.map((market) => (
                <PropBetRow key={market.id} market={market} />
              ))}
            </div>
          </WagerBox>
        ));
      }}
    </CategoryPageShell>
  );
}
