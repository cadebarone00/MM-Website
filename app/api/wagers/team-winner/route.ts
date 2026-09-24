import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentTeamWinnerState } from "@/lib/wagers/teamWinnerPricing";

/** Public read model for the Maroon vs White future: latest published odds and whether it's open. */
export async function GET() {
  try {
    const state = await currentTeamWinnerState(await getActiveSeasonYear());
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Team Winner read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Team Winner odds." }, { status: 500 });
  }
}
