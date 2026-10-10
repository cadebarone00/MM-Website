import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { personalRound, type PersonalRoundSetup } from "@/lib/platform/personalRound";
import { saveMyPlayerRound } from "@/lib/platform/playerRoundsServer";
import type { PlayerRound, ScoredCard } from "@/lib/platform/playerRounds";

/**
 * Play a round → Submit & Save: saves the signed-in player's own card (player_rounds, source "personal"). In a shared
 * round every player submits their own card; `startedAt` is the shared round's id, so each card saves once.
 */
export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  let round: PlayerRound;
  try {
    const body = await request.json() as { setup: PersonalRoundSetup; card: ScoredCard; startedAt: string };
    if (typeof body?.startedAt !== "string" || !body.setup?.course?.par || !Array.isArray(body.card?.strokes)) throw new Error("Missing round data.");
    round = personalRound(user.id, body.setup, body.card, body.startedAt);
  } catch (error) {
    return NextResponse.json({ ok: false, code: "bad_round", message: error instanceof Error ? error.message : "Bad round." }, { status: 400 });
  }
  try {
    const saved = await saveMyPlayerRound(user.id, round, null);
    return NextResponse.json({ ok: true, round: saved.round });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Personal round save failed:", message);
    // Until supabase/player_rounds.sql is run, the save function doesn't exist yet.
    const notInstalled = /save_player_round|function|does not exist|schema cache/i.test(message);
    return NextResponse.json({ ok: false, code: notInstalled ? "not_installed" : "failed" }, { status: notInstalled ? 503 : 500 });
  }
}
