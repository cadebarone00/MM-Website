import { NextResponse } from "next/server";
import { getConfirmedRoster } from "@/lib/data/activeSeasonOverlay";

export async function GET() {
  const roster = await getConfirmedRoster();
  return NextResponse.json({ ok: true, roster }, { headers: { "Cache-Control": "no-store" } });
}
