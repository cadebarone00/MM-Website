import { NextResponse } from "next/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getArchivedHandicapRounds } from "@/lib/data/archivedScorecards";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getPlayerProfileBySlug(slug)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const [summary, archivedRounds] = await Promise.all([
      getHandicapSummaryForPlayer(slug),
      getArchivedHandicapRounds(slug),
    ]);
    const { index } = combinedHandicapIndexes(summary.rounds, archivedRounds);
    return NextResponse.json({ ok: true, index }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
