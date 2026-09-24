import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentLowIndividualState } from "@/lib/wagers/lowIndividualPricing";

export const maxDuration = 60;

/** Public read model for the Low Individual future. Recomputes the odds first
 * when they're missing or out of date (see currentLowIndividualState). */
export async function GET() {
  try {
    const state = await currentLowIndividualState(await getActiveSeasonYear(), { selfHeal: true });
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Low Individual read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Low Individual odds." }, { status: 500 });
  }
}
