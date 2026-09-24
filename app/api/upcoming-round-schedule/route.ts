import { NextResponse } from "next/server";
import { getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";

export async function GET() {
  const schedule = await getUpcomingRoundSchedule();
  return NextResponse.json({ ok: true, schedule }, { headers: { "Cache-Control": "no-store" } });
}
