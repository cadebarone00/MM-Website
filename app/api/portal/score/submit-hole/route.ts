import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { submitHoleAsPlayer } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, target, hole, score, putts, fir, gir } = await request.json();
  if (typeof round !== "number" || (target !== "self" && target !== "partner") || typeof hole !== "number" || typeof score !== "number") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const result = await submitHoleAsPlayer(player.playerFullName, round, target, hole, score, Number(putts) || 0, Boolean(fir), Boolean(gir));
  return NextResponse.json(result);
}
