import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { priceTeamWinnerMatchups, publishTeamWinnerOdds } from "@/lib/wagers/teamWinnerPricing";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Prices a chunk of Team Winner matchups; the Tiger panel calls this repeatedly
 * until `remaining` reaches 0, then the odds are published. */
export async function POST(request: Request) {
  if (!(await requireHost())) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const seasonYear = await getActiveSeasonYear();
  try {
    const progress = await priceTeamWinnerMatchups(seasonYear, { budgetMs: 40_000, reset: body?.reset === true });
    const done = progress.remaining === 0 && !progress.blockers.length;
    const published = done ? await publishTeamWinnerOdds(seasonYear) : null;
    return NextResponse.json({ ok: true, seasonYear, ...progress, done, published });
  } catch (error) {
    console.error("Team Winner pricing failed:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Pricing failed." }, { status: 500 });
  }
}
