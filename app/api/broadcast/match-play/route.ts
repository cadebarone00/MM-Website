import { NextResponse } from "next/server";
import { getBroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/** Public, unauthenticated — re-fetched by the /broadcast client whenever Realtime signals a live_match_boxes/live_hole_scores change (see components/broadcast/BroadcastStage.tsx). */
export async function GET() {
  const payload = await getBroadcastMatchPlay();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
