import { after, NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { TEAM_WINNER_PRICING_BUDGET_MS, currentTeamWinnerState, refreshTeamWinnerOdds } from "@/lib/wagers/teamWinnerPricing";
import { maroonEdition } from "@/lib/platform/editionScope";

export const maxDuration = 60;

/** Public read model for the Maroon vs White future. When odds are missing,
 * old, stale, or still being priced, it answers with what it has and prices
 * the next chunk in the background — there's no Admin button. */
export async function GET() {
  try {
    const seasonYear = await getActiveSeasonYear();
    const state = await currentTeamWinnerState(maroonEdition(seasonYear));
    if (state.needsRefresh) after(() => refreshTeamWinnerOdds(maroonEdition(seasonYear), { pricingBudgetMs: TEAM_WINNER_PRICING_BUDGET_MS }));
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Team Winner read failed:", error);
    return NextResponse.json({ ok: false, error: "Couldn't load Team Winner odds." }, { status: 500 });
  }
}
