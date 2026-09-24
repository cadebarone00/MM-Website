import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getPlayerRounds } from "@/lib/scorekeeper/client";
import { getPlayerProfileBySlug } from "@/lib/data/players";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  // The legacy Google-Sheet scoring API is keyed by player NAME and only knows
  // the hand-written roster. A dynamically-added player must never be able to
  // borrow a hand-written player's identity by sharing (or being renamed to)
  // their name.
  if (!getPlayerProfileBySlug(player.playerSlug)) {
    return NextResponse.json({ ok: false, error: "Not available for this player." }, { status: 403 });
  }

  const result = await getPlayerRounds(player.playerFullName);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
