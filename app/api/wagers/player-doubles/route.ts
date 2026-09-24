import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentPlayerStatState } from "@/lib/wagers/playerBirdiesPricing";

export const maxDuration = 60;

/** Public read model for the Player Doubles future. Recomputes the odds first
 * when they're missing or out of date (see currentPlayerStatState). */
export async function GET() {
  try {
    const state = await currentPlayerStatState(await getActiveSeasonYear(), "doubles", { selfHeal: true });
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Player Doubles read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Player Doubles odds." }, { status: 500 });
  }
}
