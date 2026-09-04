"use client";

import { useState } from "react";
import { TeamMatchesBoard } from "./TeamMatchesBoard";
import { IndividualLeaderboardTable } from "./IndividualLeaderboardTable";
import { Tabs } from "@/components/ui/Tabs";
import type { TabItem } from "@/components/ui/Tabs";
import type { Tournament } from "@/lib/data/types";

export type LiveIndividualStanding = {
  player: string;
  team: "maroon" | "white";
  toPar: number;
  played: number;
  gross: number;
  par: number;
};

type View = "team" | "individual";

const VIEW_TABS: TabItem[] = [
  { value: "team", label: "Match Play" },
  { value: "individual", label: "Individual" },
];

export function LeaderboardBoard({ tournament, live, liveStandings }: { tournament: Tournament; live: boolean; liveStandings?: LiveIndividualStanding[] }) {
  const [view, setView] = useState<View>("team");

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <Tabs items={VIEW_TABS} value={view} onChange={(v) => setView(v as View)} variant="plain" />
      </div>

      {view === "team" ? <TeamMatchesBoard tournament={tournament} live={live} /> : <IndividualLeaderboardTable tournament={tournament} liveStandings={liveStandings} />}
    </div>
  );
}
