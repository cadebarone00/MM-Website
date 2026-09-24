// app/portal/admin/scorecards/[tournament]/[player]/[round]/page.tsx
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getArchivedRoundScorecard, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { ScorecardEditor } from "@/components/portal/tiger/ScorecardEditor";

export default async function ScorecardEditorPage({ params }: { params: Promise<{ tournament: string; player: string; round: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug, player: playerSlug, round: roundStr } = await params;
  const round = Number(roundStr);
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  if (!playerProfile || !Number.isInteger(round)) notFound();

  const scorecard = await getArchivedRoundScorecard(tournamentSlug, playerSlug, round);
  if (!scorecard) notFound();
  const videoUrls = await getShotVideoUrls(tournamentSlug, playerSlug, round);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <ScorecardEditor
        tournamentSlug={tournamentSlug}
        playerSlug={playerSlug}
        initialScorecard={scorecard}
        initialVideoUrls={videoUrls}
        backHref={`/portal/admin/scorecards/${tournamentSlug}/${playerSlug}`}
      />
    </div>
  );
}
