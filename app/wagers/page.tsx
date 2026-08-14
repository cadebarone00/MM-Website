"use client";

import { useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { MarketRow } from "@/components/wagers/MarketRow";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";
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
            {category === "team-futures" && (
              <div className="flex flex-col divide-y divide-ink-100">
                <MarketRow href="/wagers/team-futures/team-winner" label="Team Winner" />
              </div>
            )}
            {category === "player-futures" && (
              <div className="flex flex-col divide-y divide-ink-100">
                <MarketRow href="/wagers/player-futures/tournament-winner" label="Tournament Winner" />
              </div>
            )}
            {category === "matches" && <MatchesList tournament={tournament} />}
            {category === "props" && <PropsList tournament={tournament} />}
            {category === "fourballs" && <p className="font-sans text-sm text-ink-400">No fourball markets posted yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
