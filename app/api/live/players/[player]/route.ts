import { NextResponse } from "next/server";
import { nextTournament } from "@/lib/data";
import { getPlayerSlug } from "@/lib/data/players";
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { playerProfilePayload } from "@/lib/live/playerProfile";

export async function GET(_request: Request, { params }: { params: Promise<{ player: string }> }) {
  const { player } = await params;
  try {
    // Public calendar season, never the host's rehearsal/active scoring year.
    const snapshot = await buildLiveTournamentSnapshot(nextTournament.year, { confirmedOnly: true });
    return NextResponse.json({ ok: true, ...playerProfilePayload(snapshot, getPlayerSlug(player)) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Player scores are temporarily unavailable." }, { status: 503 });
  }
}
