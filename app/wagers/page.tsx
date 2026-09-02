"use client";

import { useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { MarketRow } from "@/components/wagers/MarketRow";
import { FuturesMarketCard } from "@/components/wagers/FuturesMarketCard";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";
import { futurePlayerMarket, futureTeamMarket } from "@/lib/wagers/marketKeys";
import type { RealMatch, Tournament } from "@/lib/data/types";

type Category = "team-futures" | "player-futures" | "matches" | "fourballs" | "props";

const CATEGORY_ITEMS: TabItem[] = [
  { value: "team-futures", label: "Team Futures" },
  { value: "player-futures", label: "Player Futures" },
  { value: "matches", label: "Matches" },
  { value: "fourballs", label: "Fourballs" },
  { value: "props", label: "Props" },
];

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

function matchTitle(match: RealMatch): string {
  return `${sideLabel(match.maroonPlayers)} vs ${sideLabel(match.whitePlayers)}`;
}

function MatchesList({ tournament }: { tournament: Tournament }) {
  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));
  if (todaysMatches.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No matches posted yet.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-ink-100">
      {todaysMatches.map((match) => (
        <MarketRow key={match.id} href={`/wagers/matches/${match.id}`} label={matchTitle(match)} />
      ))}
    </div>
  );
}

function PropsList({ tournament }: { tournament: Tournament }) {
  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));
  if (todaysMatches.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No player props posted yet.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-ink-100">
      {todaysMatches.map((match) => (
        <MarketRow key={match.id} href={`/wagers/props/${match.id}`} label={`${matchTitle(match)} — Props`} />
      ))}
    </div>
  );
}

function PlayerFuturesList({ tournament }: { tournament: Tournament }) {
  const market = futurePlayerMarket(tournament.slug, tournament.individualLeaderboard, [...tournament.roster.maroon, ...tournament.roster.white]);

  if (market.selections.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  return (
    <FuturesMarketCard
      title="Tournament Winner"
      marketKey={market.marketKey}
      selections={market.selections}
      href="/wagers/player-futures/tournament-winner"
      limit={3}
    />
  );
}

function TeamFuturesList({ tournament }: { tournament: Tournament }) {
  const market = futureTeamMarket(tournament);

  return <FuturesMarketCard title="Team Winner" marketKey={market.marketKey} selections={market.selections} href="/wagers/team-futures/team-winner" />;
}

export default function WagersPage() {
  const [category, setCategory] = useState<Category>("team-futures");
  const { tournament, loading, payload } = useLiveTournament();
  const { mode } = useWagersMode();

  return (
    <div className="px-4 pt-4 sm:px-7">
      <Tabs items={CATEGORY_ITEMS} value={category} onChange={(v) => setCategory(v as Category)} variant="plain" />
      <div className="mt-6">
        {mode === "real" ? (
          <ComingSoonNotice />
        ) : loading && !payload ? (
          <p className="py-10 text-center font-sans text-sm text-ink-400">Checking the live sheet...</p>
        ) : (
          <>
            {category === "team-futures" && <TeamFuturesList tournament={tournament} />}
            {category === "player-futures" && <PlayerFuturesList tournament={tournament} />}
            {category === "matches" && <MatchesList tournament={tournament} />}
            {category === "props" && <PropsList tournament={tournament} />}
            {category === "fourballs" && <p className="font-sans text-sm text-ink-400">No fourball markets posted yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
