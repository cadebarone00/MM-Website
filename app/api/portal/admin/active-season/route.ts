import { getSeasonCalendar } from "@/lib/live/seasonCalendarServer";
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const calendar = await getSeasonCalendar();
  if (calendar.scheduled && year !== 2034 && year !== calendar.activeYear) return NextResponse.json({ ok: false, error: "The locked season calendar controls the active year. Update the handoff dates in the overview." }, { status: 409 });
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_active_season").update({ season_year: year }).eq("id", true);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not set the active year." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
