import { NextResponse } from "next/server";
import { getPlayerNameMap } from "@/lib/portal/allPlayers";

/** Public slug -> display name map, static and DB-only players alike.
 * Client components use this to resolve a player added through the Add
 * Player admin tool, which the static per-player files don't know about. */
export async function GET() {
  try {
    const names = await getPlayerNameMap();
    return NextResponse.json({ ok: true, names }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
