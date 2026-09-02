import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pastTournaments } from "@/lib/data";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";
import { buildCareerStats } from "@/lib/data/careerStats";
import { CareerStatsPanel } from "@/components/portal/tiger/CareerStatsPanel";

export default async function CareerStatsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const scorecardSets = await Promise.all(
    pastTournaments.map(async (tournament) => ({ year: tournament.year, scorecards: await getScorecardsForTournament(tournament) }))
  );
  const players = buildCareerStats(scorecardSets);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Career Stats</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Career records from the archived 2024–2026 scorecards. These tables recalculate whenever those saved scorecards change.</p>
      <div className="mt-6"><CareerStatsPanel players={players} /></div>
    </div>
  );
}
