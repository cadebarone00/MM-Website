import { NextResponse } from "next/server";
import { getBroadcastPayload } from "@/lib/broadcast/state";

/**
 * Public, unauthenticated — the /broadcast page (no login) reads this on
 * load and again on every reconnect (see the spec's §33 State Recovery).
 * Never returns tournament/scoring data itself, only broadcast state.
 */
export async function GET() {
  const payload = await getBroadcastPayload();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
