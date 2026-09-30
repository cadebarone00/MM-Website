import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { TIMEZONE_IDS } from "@/lib/data/timezones";
import { deriveMatchTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import type { MatchFormat } from "@/lib/live/types";

// The timezone itself saved fine; only the follow-up re-derivation of
// already-built matches failed. Same shape as the lock route's "matchups
// locked, but Career Archive publishing failed" message: say plainly what did
// save, and give the one manual action that finishes the job.
const REDERIVE_FAILED =
  "Timezone saved, but this year's existing match tee times could not all be re-derived for the new zone. Unlock and re-lock each session's course on Courses & Format to refresh them.";

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
  // Read the zone this year is on *before* overwriting it, so the save below
  // can tell an actual timezone change from a no-op re-save. A year with no
  // settings row yet counts as being on the column's own default.
  const { data: priorSettings } = await service
    .from("live_tournament_settings")
    .select("timezone")
    .eq("season_year", year)
    .maybeSingle();
  const priorTimezone = priorSettings?.timezone ?? "America/Los_Angeles";

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

  // A year's timezone is what turns a session's typed "HH:MM" slot into the
  // absolute instant stored on each match's tee_time column — and tee_time
  // (not the session's slots) is what drives the automatic Scheduled -> Armed
  // -> Live transition and every viewer-local display. Changing the zone here
  // would otherwise leave every already-built match on the OLD zone's instant
  // while Matchups (which recomputes its label live from the slots + the new
  // zone) shows something else. So re-derive every existing match in this
  // year, exactly the way locking a session's course re-derives that one
  // session's matches (see app/api/portal/admin/sessions/lock/route.ts).
  if (timezone !== priorTimezone) {
    const { data: sessionRows, error: sessionsError } = await service
      .from("live_round_state")
      .select("round, date, match_tee_times")
      .eq("season_year", year);
    if (sessionsError) {
      console.error("Timezone change: could not load this year's sessions to re-derive tee times:", sessionsError);
      return NextResponse.json({ ok: false, error: REDERIVE_FAILED }, { status: 500 });
    }

    for (const sessionRow of sessionRows ?? []) {
      const teeTimes = (sessionRow.match_tee_times as (string | null)[] | null) ?? [null, null, null];
      const { data: matchRows, error: matchesError } = await service
        .from("live_match_boxes")
        .select("id, box_number, format, tee_time")
        .eq("season_year", year)
        .eq("round", sessionRow.round);
      if (matchesError) {
        console.error("Timezone change: could not load a session's matches to re-derive tee times:", matchesError);
        return NextResponse.json({ ok: false, error: REDERIVE_FAILED }, { status: 500 });
      }

      for (const match of matchRows ?? []) {
        const slot = teeTimeSlotForMatch(match.format as MatchFormat, match.box_number);
        const derived = deriveMatchTeeTime(sessionRow.date, teeTimes[slot] ?? null, timezone);
        if (!derived) continue;
        if (match.tee_time && new Date(match.tee_time).getTime() === derived.getTime()) continue;
        const { error: teeTimeError } = await service
          .from("live_match_boxes")
          .update({ tee_time: derived.toISOString() })
          .eq("id", match.id);
        if (teeTimeError) {
          console.error("Timezone change: could not update a match's tee time:", teeTimeError);
          return NextResponse.json({ ok: false, error: REDERIVE_FAILED }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
