import { getSeasonOverview } from "@/lib/live/seasonOverviewServer";
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { OVERVIEW_YEARS, validCalendarDate } from "@/lib/live/seasonCalendar";
import { TEST_SEASON_YEAR } from "@/lib/live/testSeason";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const { year, activeOn, passOn, locked } = await request.json();
  if (!OVERVIEW_YEARS.includes(year) || year === TEST_SEASON_YEAR || typeof locked !== "boolean" || (activeOn !== null && !validCalendarDate(activeOn)) || (passOn !== null && !validCalendarDate(passOn)) || (activeOn && passOn && activeOn >= passOn) || (locked && (!activeOn || !passOn))) {
    return NextResponse.json({ ok: false, error: "Choose an Active date before the Pass on date. Both are required to arm the handoff. The test season cannot be scheduled." }, { status: 400 });
  }
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.rpc("save_season_calendar", { p_year: year, p_active: activeOn, p_pass: passOn, p_locked: locked });
  if (error) return NextResponse.json({ ok: false, error: ["23514", "P0001"].includes(error.code) ? error.message : "Could not save the calendar. Apply season_calendar.sql before using these controls." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  try { return NextResponse.json({ ok: true, overview: await getSeasonOverview() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false, error: "Could not refresh the year overview." }, { status: 503 }); }
}
