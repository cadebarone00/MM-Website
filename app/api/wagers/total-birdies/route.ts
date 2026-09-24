import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentTotalBirdiesState } from "@/lib/wagers/totalBirdiesPricing";

export const maxDuration = 60;

/** Public read model for the Total Birdies future. Recomputes the odds first
 * when they're missing or out of date (see currentTotalBirdiesState). */
export async function GET() {
  try {
    const state = await currentTotalBirdiesState(await getActiveSeasonYear(), { selfHeal: true });
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Total Birdies read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Total Birdies odds." }, { status: 500 });
  }
}
