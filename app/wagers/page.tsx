"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName, getPlayerProfile, playerProfiles } from "@/lib/data/players";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { ComingSoonNotice } from "@/components/wagers/ComingSoonNotice";
import { useWagersMode } from "@/components/wagers/WagersModeContext";
import { LiveMatchesList } from "@/components/wagers/LiveMatchesList";
import { TeamWinnerFutureCard } from "@/components/wagers/TeamWinnerFutureCard";
import type { Tournament } from "@/lib/data/types";

type Category = "team-futures" | "player-futures" | "matches" | "fourballs" | "props";

const CATEGORY_ITEMS: TabItem[] = [
  { value: "team-futures", label: "Futures" },
  { value: "player-futures", label: "Players" },
  { value: "matches", label: "Matches" },
  { value: "fourballs", label: "Fourballs" },
  { value: "props", label: "Props" },
];

/** Shown for categories whose markets have no settlement path yet. Bets are
 * only accepted on markets that settle automatically (live matches today). */
function LinesComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-cream-50 p-6 text-center">
      <p className="m-0 font-sans text-sm font-semibold text-ink-500">{label} lines are coming soon.</p>
      <p className="mt-1 font-sans text-2xs text-ink-400">Live match markets are open on the Matches tab.</p>
    </div>
  );
}

function PlayersList({ tournament }: { tournament: Tournament }) {
  const playerIds = [...tournament.roster.maroon, ...tournament.roster.white];
  const players = playerIds.length > 0 ? playerIds : playerProfiles.map((player) => player.id);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {players.map((player) => (
        <Link
          key={player}
          href={`/wagers/players/${getPlayerProfile(player)?.slug ?? player.toLowerCase()}`}
          className="rounded-sm border border-gold-300 bg-white px-4 py-3 font-sans text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-50"
        >
          {getPlayerDisplayName(player)}
        </Link>
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
        {category === "team-futures" ? (
          // Futures shows its odds in both modes; the card itself explains Real Wagers isn't live yet.
          <TeamWinnerFutureCard mode={mode} />
        ) : mode === "real" ? (
          <ComingSoonNotice />
        ) : loading && !payload ? (
          <p className="py-10 text-center font-sans text-sm text-ink-400">Checking the live sheet...</p>
        ) : (
          <>
            {category === "player-futures" && <PlayersList tournament={tournament} />}
            {category === "matches" && <LiveMatchesList />}
            {category === "props" && <LinesComingSoon label="Prop" />}
            {category === "fourballs" && <p className="font-sans text-sm text-ink-400">No fourball markets posted yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
