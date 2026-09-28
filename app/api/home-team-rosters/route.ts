import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { SEASON_YEARS } from "@/lib/live/seasonYears";

export async function GET() {
  const service = createSupabaseServiceRoleClient();
  const years = SEASON_YEARS.filter((year) => year !== 2034);
  const [roster, locks, players] = await Promise.all([
    service.from("live_roster").select("season_year, player_slug, team").in("season_year", years),
    service.from("live_roster_assignment_locks").select("season_year, player_slug").in("season_year", years),
    getAllPlayerRows(),
  ]);
  if (roster.error || locks.error) return NextResponse.json({ error: "Rosters unavailable" }, { status: 503 });
  const confirmed = new Set((locks.data ?? []).map((row) => `${row.season_year}:${row.player_slug}`));
  const names = new Map(players.map((player) => [player.playerSlug, player.fullName]));
  return NextResponse.json({ roster: (roster.data ?? [])
    .filter((row) => confirmed.has(`${row.season_year}:${row.player_slug}`))
    .map((row) => ({ year: row.season_year, slug: row.player_slug, team: row.team, name: names.get(row.player_slug) ?? row.player_slug }))
  }, { headers: { "Cache-Control": "no-store" } });
}
