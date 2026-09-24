import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findCurrentRoundForPlayer } from "@/lib/live/currentRoundForPlayer";
import { loadScoringProgress } from "@/lib/live/scoringProgress";
import { scoringStage } from "@/lib/live/scoringStage";
import { ScoringStatusScreen } from "@/components/portal/ScoringStatusScreen";

export default async function ScoringPage() {
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
  const playerName = playerProfile?.fullName ?? profile.display_name;
  const result = await findCurrentRoundForPlayer(playerSlug);

  const progress = result ? await loadScoringProgress(result, playerSlug) : null;
  const stage = scoringStage({
    hasMatch: !!result,
    matchState: result?.state ?? null,
    holesEntered: progress?.holesEntered ?? 0,
    roundCard: progress?.roundCard ?? "waiting",
    iSubmitted: progress?.iSubmitted ?? false,
  });

  return <ScoringStatusScreen playerName={playerName} playerSlug={playerSlug} result={result} stage={stage} progress={progress} />;
}
