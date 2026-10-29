import "server-only";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import { getBroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/** Existing founding-tournament readers only; no new scoring or publication path. */
export async function loadTapInDisplay() {
  const year = await getBroadcastDisplayYear();
  const [leaderboard, matchPlay] = await Promise.all([getBroadcastLeaderboard(year), getBroadcastMatchPlay(year)]);
  return { leaderboard, matchPlay };
}
