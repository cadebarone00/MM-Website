"use client";

import { LeaderboardStrip } from "@/components/leaderboard/LeaderboardStrip";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";

/** Hidden entirely outside the live tournament window — no empty strip in the off-season. */
export function LiveLeaderboardStripSection() {
  const { tournament } = useLiveTournament();
  if (getNextTournamentStatus() !== "live") return null;
  return <LeaderboardStrip tournament={tournament} />;
}
