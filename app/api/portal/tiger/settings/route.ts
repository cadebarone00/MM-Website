import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { TournamentSettings } from "@/lib/live/types";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data } = await service
    .from("live_tournament_settings")
    .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
    .eq("season_year", year)
    .maybeSingle();

  const settings: TournamentSettings = {
    roundCount: data?.round_count ?? null,
    completedAt: data?.completed_at ?? null,
    venueName: data?.venue_name ?? null,
    venueLocked: data?.venue_locked ?? false,
    beginDate: data?.begin_date ?? null,
    endDate: data?.end_date ?? null,
    datesLocked: data?.dates_locked ?? false,
  };
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, roundCount } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  if (typeof roundCount !== "number" || roundCount < 6 || roundCount > 10) {
    return NextResponse.json({ ok: false, error: "Round count must be between 6 and 10." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { error: settingsError } = await service.from("live_tournament_settings").upsert({ season_year: year, round_count: roundCount });
  if (settingsError) {
    return NextResponse.json({ ok: false, error: "Could not save the round count." }, { status: 500 });
  }

  const { data: existing } = await service.from("live_round_state").select("round").eq("season_year", year);
  const existingRounds = new Set((existing ?? []).map((r) => r.round));
  const missing = Array.from({ length: roundCount }, (_, i) => i + 1).filter((round) => !existingRounds.has(round));

  if (missing.length > 0) {
    const { error: insertError } = await service.from("live_round_state").insert(missing.map((round) => ({ season_year: year, round })));
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not create the new round slots." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
