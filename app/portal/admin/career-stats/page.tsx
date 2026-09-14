import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CareerStatsPanel } from "@/components/portal/tiger/CareerStatsPanel";
import { RoundFormatArchive, type RoundFormatTournament } from "@/components/portal/tiger/RoundFormatArchive";
import { careerArchivePartnerships } from "@/lib/data/careerArchive";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { pastTournaments } from "@/lib/data";
import { roundFormatArchive } from "@/lib/data/roundFormatArchive";
import { getOrphanArchivedRounds } from "@/lib/data/archivedScorecards";

export default async function CareerStatsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const { records, teamRecords } = await getCombinedCareerArchive();

  const roundFormatTournaments: RoundFormatTournament[] = await Promise.all(
    pastTournaments.map(async (tournament) => {
      const entries = roundFormatArchive(tournament);
      const orphans = await getOrphanArchivedRounds(tournament.slug, entries.length).catch((err) => {
        console.error(`Failed to load orphan archived rounds for ${tournament.slug}:`, err);
        return [];
      });
      return { slug: tournament.slug, editionLabel: tournament.editionLabel, entries, orphans };
    })
  );

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Career Stats</h1>
      <div className="mt-6"><RoundFormatArchive tournaments={roundFormatTournaments} /></div>
      <p className="mt-8 font-sans text-sm text-ink-500">The permanent, versioned archive for historical player, partnership, and match data. Individual score history remains separate from Fourball and Alternate Shot team results.</p>
      <div className="mt-6"><CareerStatsPanel records={records} partnerships={careerArchivePartnerships} teamRecords={teamRecords} /></div>
    </div>
  );
}
