import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { getArchivedHandicapRounds } from "@/lib/data/archivedScorecards";

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
  const [summary, archivedRounds] = await Promise.all([
    getHandicapSummaryForPlayer(playerSlug),
    getArchivedHandicapRounds(playerSlug),
  ]);
  // getHandicapSummaryForPlayer's index/lowIndex only account for rounds the
  // player submitted themselves; combine in Maroon Masters archive rounds
  // that now carry a verified tee/rating/slope (see archiveIndex.ts).
  const fullSummary = { ...summary, ...combinedHandicapIndexes(summary.rounds, archivedRounds) };

  return <HandicapHome playerName={playerName} summary={fullSummary} archivedRounds={archivedRounds} team={findPlayerTeam(playerSlug)} />;
}
