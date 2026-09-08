import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTournament } from "@/lib/data";
import { getArchivedRoundScorecard, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import { ScorecardEditor } from "@/components/portal/tiger/ScorecardEditor";

export default async function PlayerRoundVideoEditorPage({ params }: { params: Promise<{ tournament: string; round: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profile?.player_slug) redirect("/portal");

  const { tournament: tournamentSlug, round: roundText } = await params;
  const round = Number(roundText);
  if (!getTournament(tournamentSlug) || !Number.isInteger(round)) notFound();

  const [scorecard, videoUrls] = await Promise.all([
    getArchivedRoundScorecard(tournamentSlug, profile.player_slug, round),
    getShotVideoUrls(tournamentSlug, profile.player_slug, round),
  ]);
  if (!scorecard) notFound();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10 sm:px-7">
      <ScorecardEditor
        tournamentSlug={tournamentSlug}
        playerSlug={profile.player_slug}
        initialScorecard={scorecard}
        initialVideoUrls={videoUrls}
        backHref="/portal/round-video"
        videoOnly
      />
    </main>
  );
}
