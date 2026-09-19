import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { submitHoleAsPlayer } from "@/lib/scorekeeper/client";
import { getPlayerProfileBySlug } from "@/lib/data/players";

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  // The legacy Google-Sheet scoring API is keyed by player NAME and only knows
  // the hand-written roster. A dynamically-added player must never be able to
  // borrow a hand-written player's identity by sharing (or being renamed to)
  // their name.
  if (!getPlayerProfileBySlug(player.playerSlug)) {
    return NextResponse.json({ ok: false, error: "Not available for this player." }, { status: 403 });
  }

  const { round, target, hole, score, putts, fir, gir } = await request.json();
  if (typeof round !== "number" || (target !== "self" && target !== "partner") || typeof hole !== "number" || typeof score !== "number") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const result = await submitHoleAsPlayer(player.playerFullName, round, target, hole, score, Number(putts) || 0, Boolean(fir), Boolean(gir));
  return NextResponse.json(result);
}
