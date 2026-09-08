import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getHandicapSummaryForPlayer, submitHandicapRound } from "@/lib/handicap/data";
import type { SubmitHandicapRoundInput } from "@/lib/handicap/types";

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

  const body = (await request.json()) as SubmitHandicapRoundInput;
  const result = await submitHandicapRound(player.playerSlug, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
