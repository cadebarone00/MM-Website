import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getPlayerRounds } from "@/lib/scorekeeper/client";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const result = await getPlayerRounds(player.playerFullName);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
