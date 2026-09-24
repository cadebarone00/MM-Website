import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentPlayerBirdiesState } from "@/lib/wagers/playerBirdiesPricing";

export const maxDuration = 60;

/** Public read model for the Player Birdies future. Recomputes the odds first
 * when they're missing or out of date (see currentPlayerBirdiesState). */
export async function GET() {
  try {
    const state = await currentPlayerBirdiesState(await getActiveSeasonYear(), { selfHeal: true });
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Player Birdies read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Player Birdies odds." }, { status: 500 });
  }
}
