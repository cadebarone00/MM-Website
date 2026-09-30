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
    .select("round_count, round_count_locked, completed_at, venue_name, venue_locked, timezone, begin_date, end_date, dates_locked")
    .eq("season_year", year)
    .maybeSingle();

  const settings: TournamentSettings = {
    sessionCount: data?.round_count ?? null,
    sessionCountLocked: data?.round_count_locked ?? false,
    completedAt: data?.completed_at ?? null,
    venueName: data?.venue_name ?? null,
    venueLocked: data?.venue_locked ?? false,
    timezone: data?.timezone ?? "America/Los_Angeles",
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

  const { year, sessionCount, sessionCountLocked } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  if (sessionCountLocked !== undefined && (typeof sessionCountLocked !== "boolean" || sessionCount !== undefined)) {
    return NextResponse.json({ ok: false, error: "Change the session count and its lock separately." }, { status: 400 });
  }
  if (sessionCountLocked === undefined && (typeof sessionCount !== "number" || !Number.isInteger(sessionCount) || sessionCount < 6 || sessionCount > 10)) {
    return NextResponse.json({ ok: false, error: "Session count must be between 6 and 10." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (sessionCountLocked !== undefined) {
    const { error } = await service.from("live_tournament_settings").upsert({ season_year: year, round_count_locked: sessionCountLocked });
    if (error) return NextResponse.json({ ok: false, error: "Could not save the session count lock. Apply session_count_lock.sql if it has not been installed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: current, error: readError } = await service.from("live_tournament_settings").select("round_count_locked").eq("season_year", year).maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: "Could not check the session count lock. Apply session_count_lock.sql if it has not been installed." }, { status: 500 });
  if (current?.round_count_locked) return NextResponse.json({ ok: false, error: "Unlock the number of sessions before changing it." }, { status: 409 });

  const { error: settingsError } = await service.from("live_tournament_settings").upsert({ season_year: year, round_count: sessionCount });
  if (settingsError) {
    return NextResponse.json({ ok: false, error: settingsError.code === "23514" ? "Unlock the number of sessions before changing it." : "Could not save the session count." }, { status: 500 });
  }

  // Create any missing session rows for 1..sessionCount — never touch
  // sessions that already exist (their date/course/format/locks stay as-is).
  const { data: existing } = await service.from("live_round_state").select("round").eq("season_year", year);
  const existingSessions = new Set((existing ?? []).map((r) => r.round));
  const missing = Array.from({ length: sessionCount }, (_, i) => i + 1).filter((session) => !existingSessions.has(session));

  if (missing.length > 0) {
    const { error: insertError } = await service.from("live_round_state").insert(missing.map((session) => ({ season_year: year, round: session })));
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not create the new session slots." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
