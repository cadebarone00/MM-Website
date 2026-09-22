import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { liveRoundFormatArchive } from "@/lib/data/liveRoundFormatArchive";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CareerStatsPanel } from "@/components/portal/tiger/CareerStatsPanel";
import { RoundFormatArchive, type RoundFormatTournament } from "@/components/portal/tiger/RoundFormatArchive";
import { careerArchivePartnerships } from "@/lib/data/careerArchive";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { nextTournament, isPastLeaderboardSwitchover, pastTournaments } from "@/lib/data";
import { getRoundFormatSetups } from "@/lib/data/roundFormatSetups";
import { roundFormatArchive } from "@/lib/data/roundFormatArchive";
import { getOrphanArchivedRounds } from "@/lib/data/archivedScorecards";
import { getCourseLibraryForHandicap } from "@/lib/handicap/data";

export default async function CareerStatsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const { records, teamRecords } = await getCombinedCareerArchive();
  const courses = await getCourseLibraryForHandicap(true);

  const setups = await getRoundFormatSetups();
  const roundFormatTournaments: RoundFormatTournament[] = await Promise.all(
    pastTournaments.map(async (tournament) => {
      const setupFor = (round: number) => setups.find((s) => s.seasonYear === tournament.year && s.round === round) ?? null;
      const entries = roundFormatArchive(tournament).map((entry) => ({ ...entry, setup: setupFor(entry.round) }));
      const orphans = await getOrphanArchivedRounds(tournament.slug, entries.length).catch((err) => {
        console.error(`Failed to load orphan archived rounds for ${tournament.slug}:`, err);
        return [];
      });
      return { slug: tournament.slug, year: tournament.year, venue: tournament.venue, entries, orphans: orphans.map((entry) => ({ ...entry, setup: setupFor(entry.round) })), dayDates: tournament.dayDates ?? {} };
    })
  );

  if (isPastLeaderboardSwitchover()) {
    const snapshot = await buildLiveTournamentSnapshot(nextTournament.year, { confirmedOnly: true });
    roundFormatTournaments.unshift({ slug: nextTournament.slug, year: nextTournament.year, venue: nextTournament.venue, orphans: [], ...liveRoundFormatArchive(snapshot, nextTournament.slug, nextTournament.year, setups) });
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Career Stats</h1>
      <div className="mt-6"><RoundFormatArchive tournaments={roundFormatTournaments} courses={courses} /></div>
      <p className="mt-8 font-sans text-sm text-ink-500">The permanent, versioned archive for historical player, partnership, and match data. Individual score history remains separate from Fourball and Alternate Shot team results.</p>
      <div className="mt-6"><CareerStatsPanel records={records} partnerships={careerArchivePartnerships} teamRecords={teamRecords} /></div>
    </div>
  );
}
