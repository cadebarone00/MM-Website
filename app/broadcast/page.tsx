import type { Metadata } from "next";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import { getBroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { getNextTournament } from "@/lib/data/activeSeasonOverlay";
import { BroadcastStage } from "@/components/broadcast/BroadcastStage";

export const metadata: Metadata = {
  title: "Watch Live — The Maroon Masters",
};

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const [broadcast, { standings }, matchPlay, nextTournament] = await Promise.all([
    getBroadcastPayload(),
    getBroadcastLeaderboard(),
    getBroadcastMatchPlay(),
    getNextTournament(),
  ]);

  return (
    <BroadcastStage
      broadcast={broadcast}
      standings={standings}
      matchPlay={matchPlay}
      holding={{ venue: nextTournament.venue, dateLabel: nextTournament.dateLabel }}
    />
  );
}
