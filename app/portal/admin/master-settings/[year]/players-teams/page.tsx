import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { PlayerTeamAssignment, type PlayerTeamRow } from "@/components/portal/PlayerTeamAssignment";

export default async function PortalAdminPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [allPlayers, { data: roster }, { data: locks }] = await Promise.all([
    getAllPlayerRows(),
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
    service.from("live_roster_assignment_locks").select("player_slug").eq("season_year", year),
  ]);
  const rosterBySlug = new Map((roster ?? []).map((r) => [r.player_slug, r.team as "maroon" | "white"]));
  const lockedSlugs = new Set((locks ?? []).map((lock) => lock.player_slug));

  const rows: PlayerTeamRow[] = allPlayers.map((p) => ({
    playerSlug: p.playerSlug,
    fullName: p.fullName,
    team: rosterBySlug.get(p.playerSlug) ?? null,
    teamLocked: lockedSlugs.has(p.playerSlug),
  }));

  return <PlayerTeamAssignment year={year} rows={rows} />;
}
