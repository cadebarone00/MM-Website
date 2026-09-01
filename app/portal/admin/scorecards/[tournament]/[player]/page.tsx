import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTournament } from "@/lib/data";
import { getArchivedRoundLabels } from "@/lib/data/archivedScorecards";
import { getPlayerProfileBySlug, getPlayerDisplayName } from "@/lib/data/players";

export default async function ScorecardsRoundPickerPage({ params }: { params: Promise<{ tournament: string; player: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug, player: playerSlug } = await params;
  const tournament = getTournament(tournamentSlug);
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  if (!tournament || !playerProfile) notFound();

  const rounds = await getArchivedRoundLabels(tournamentSlug, playerSlug);

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <Link href={`/portal/admin/scorecards?tournament=${tournamentSlug}`} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        ← {tournament.editionLabel}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-bold text-ink-900">{getPlayerDisplayName(playerSlug)}</h1>

      {rounds.length === 0 ? (
        <p className="mt-6 font-sans text-sm text-ink-500">No rounds recorded yet for this player in {tournament.editionLabel}.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {rounds.map((r) => (
            <Link
              key={r.round}
              href={`/portal/admin/scorecards/${tournamentSlug}/${playerSlug}/${r.round}`}
              className="block rounded-lg border-2 border-stone-300 px-4 py-3 font-serif text-lg font-bold text-ink-900 hover:border-maroon-700"
            >
              Round {r.round} — {r.course}
              {r.format && <span className="ml-2 font-sans text-sm font-normal text-ink-500">({r.format})</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
