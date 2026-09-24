import { after, NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getHandicapSummaryForPlayer, submitHandicapRound } from "@/lib/handicap/data";
import type { SubmitHandicapRoundInput } from "@/lib/handicap/types";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { refreshFutures } from "@/lib/wagers/refreshFutures";

// A new round changes the player's Career Archive history, so every future
// re-prices in the background within this limit.
export const maxDuration = 60;

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const summary = await getHandicapSummaryForPlayer(player.playerSlug);
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load your rounds." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  let body: SubmitHandicapRoundInput;
  try {
    body = (await request.json()) as SubmitHandicapRoundInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const result = await submitHandicapRound(player.playerSlug, body);
  if (result.ok) after(async () => refreshFutures(await getActiveSeasonYear(), { teamWinnerPricingBudgetMs: 30_000 }));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
