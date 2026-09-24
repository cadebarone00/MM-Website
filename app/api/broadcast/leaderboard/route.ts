import { NextResponse } from "next/server";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";

/** Public, unauthenticated — re-fetched by the /broadcast client whenever Realtime signals a live_hole_scores change (see components/broadcast/BroadcastStage.tsx). */
export async function GET() {
  const payload = await getBroadcastLeaderboard();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
