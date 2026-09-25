import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { TIMEZONE_IDS } from "@/lib/data/timezones";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, beginDate, endDate, datesLocked, venueName, venueLocked, timezone } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  if (typeof datesLocked !== "boolean" || typeof venueLocked !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }
  if (beginDate !== null && typeof beginDate !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid begin date." }, { status: 400 });
  }
  if (endDate !== null && typeof endDate !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid end date." }, { status: 400 });
  }
  if (venueName !== null && typeof venueName !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid venue name." }, { status: 400 });
  }
  if (typeof timezone !== "string" || !TIMEZONE_IDS.has(timezone)) {
    return NextResponse.json({ ok: false, error: "Invalid timezone." }, { status: 400 });
  }
  if (datesLocked && (!beginDate || !endDate)) {
    return NextResponse.json({ ok: false, error: "Set both dates before locking them." }, { status: 400 });
  }
  if (venueLocked && !venueName?.trim()) {
    return NextResponse.json({ ok: false, error: "Set a venue name before locking it." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_tournament_settings").upsert({
    season_year: year,
    begin_date: beginDate,
    end_date: endDate,
    dates_locked: datesLocked,
    venue_name: venueName,
    venue_locked: venueLocked,
    timezone,
  });
  if (error) {
    console.error("Master Settings save failed:", error);
    const needsMultiYearMigration = /season_year|venue_name|venue_locked|begin_date|end_date|dates_locked|timezone|primary key|duplicate key/i.test(error.message);
    return NextResponse.json({
      ok: false,
      error: needsMultiYearMigration
        ? "Your Supabase database needs the current multi-year setup. Run the full supabase/live_match_publication.sql file (and supabase/tournament_timezone.sql) in the Supabase SQL Editor, then save again."
        : `Could not save Master Settings: ${error.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
