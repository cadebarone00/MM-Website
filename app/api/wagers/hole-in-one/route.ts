import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentHoleInOneState } from "@/lib/wagers/holeInOnePricing";

/** Public read model for the Hole in One future, computed fresh on each read. */
export async function GET() {
  try {
    const state = await currentHoleInOneState(await getActiveSeasonYear());
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Hole in One read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Hole in One odds." }, { status: 500 });
  }
}
