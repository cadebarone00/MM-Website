import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";

export default async function HandicapPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug, display_name")
    .eq("id", user.id)
    .single();

  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const playerName = playerProfile?.fullName ?? profile.display_name ?? "Player";
  const summary = await getHandicapSummaryForPlayer(playerSlug);

  return <HandicapHome playerName={playerName} summary={summary} team={findPlayerTeam(playerSlug)} />;
}
