import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { LiveRoundState, MatchFormat } from "@/lib/live/types";

const VALID_FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

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
  const { data, error } = await service
    .from("live_round_state")
    .select("round, started, course_id, date, format, course_locked, matchups_locked")
    .eq("season_year", year)
    .order("round");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the rounds." }, { status: 500 });
  }

  const rounds: LiveRoundState[] = (data ?? []).map((row) => ({
    seasonYear: year,
    round: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
  }));
  return NextResponse.json({ ok: true, rounds }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, date, courseId, format } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }
  if (format !== undefined && !VALID_FORMATS.includes(format)) {
    return NextResponse.json({ ok: false, error: "Invalid format." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (date !== undefined) update.date = date;
  if (courseId !== undefined) update.course_id = courseId;
  if (format !== undefined) update.format = format;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (format !== undefined) {
    const { data: current } = await service.from("live_round_state").select("format").eq("season_year", year).eq("round", round).single();
    if (current && current.format !== format) {
      const { error: boxesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", round);
      if (boxesError) {
        return NextResponse.json({ ok: false, error: "Could not clear this round's match boxes for the new format." }, { status: 500 });
      }
    }
  }

  const { error } = await service.from("live_round_state").update(update).eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
