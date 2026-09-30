import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { RosterEntry, Team } from "@/lib/live/types";

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
  const [{ data, error }, { data: locks, error: locksError }] = await Promise.all([
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
    service.from("live_roster_assignment_locks").select("player_slug").eq("season_year", year),
  ]);
  if (error || locksError) {
    return NextResponse.json({ ok: false, error: "Could not load the roster." }, { status: 500 });
  }

  const roster: RosterEntry[] = (data ?? []).map((row) => ({ seasonYear: year, playerSlug: row.player_slug, team: row.team as Team }));
  return NextResponse.json({ ok: true, roster, lockedPlayerSlugs: (locks ?? []).map((lock) => lock.player_slug) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, playerSlug, team } = await request.json();
  if (!isValidSeasonYear(year) || typeof playerSlug !== "string" || (team !== null && team !== "maroon" && team !== "white")) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { data: lock } = await service
    .from("live_roster_assignment_locks")
    .select("player_slug")
    .eq("season_year", year)
    .eq("player_slug", playerSlug)
    .maybeSingle();
  if (lock) {
    return NextResponse.json({ ok: false, error: "Unlock this player’s team assignment before changing it." }, { status: 409 });
  }

  const { error } = team === null
    ? await service.from("live_roster").delete().eq("season_year", year).eq("player_slug", playerSlug)
    : await service.from("live_roster").upsert({ season_year: year, player_slug: playerSlug, team });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that team assignment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
