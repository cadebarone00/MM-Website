import { NextResponse } from "next/server";
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { leaderboard } from "@/lib/live/scoring";

/** Confirmed-only individual standings. Foursome is excluded by the shared
 * scoring rule, while confirmed Singles/Fourball strokes count immediately. */
export async function GET() {
  const seasonYear = await getActiveSeasonYear();
  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const standings = leaderboard(snapshot).filter((entry) => entry.played > 0).map((entry) => ({
    player: entry.player,
    team: entry.team,
    toPar: entry.toPar,
    played: entry.played,
    gross: entry.gross,
    par: entry.par,
  }));
  return NextResponse.json({ ok: true, seasonYear, standings }, { headers: { "Cache-Control": "no-store" } });
}
