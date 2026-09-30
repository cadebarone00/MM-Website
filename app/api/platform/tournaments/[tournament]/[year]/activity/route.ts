import { NextResponse } from "next/server";
import { loadTournamentActivity } from "@/lib/platform/activityServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/**
 * The tournament's activity feed for the current viewer (anyone the public
 * site would serve; commissioners also before publishing). Players-only
 * items are included only for the tournament's players/commissioners and
 * platform admins. Everyone else gets a plain 404.
 */
export async function GET(request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 30);
  const feed = await loadTournamentActivity(tournament, year, { limit: Number.isInteger(limit) ? limit : 30 });
  if (!feed) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ...feed }, { headers: { "Cache-Control": "private, no-store" } });
}
