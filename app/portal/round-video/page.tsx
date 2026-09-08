import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pastTournaments } from "@/lib/data";
import { getArchivedRoundLabels } from "@/lib/data/archivedScorecards";

export default async function RoundVideoPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profile?.player_slug) redirect("/portal");

  const tournaments = await Promise.all(pastTournaments.map(async (tournament) => ({
    tournament,
    rounds: await getArchivedRoundLabels(tournament.slug, profile.player_slug!),
  })));
  const available = tournaments.filter(({ rounds }) => rounds.length > 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-7">
      <Link href="/portal" className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">← Back to Portal</Link>
      <h1 className="mt-3 font-serif text-3xl font-bold text-ink-900">Round Video</h1>
      <p className="mt-2 max-w-xl font-sans text-sm text-ink-600">Choose one of your recorded rounds to upload or replace videos. Your official scores and statistics are visible but cannot be changed here.</p>

      {available.length === 0 ? (
        <p className="mt-8 font-sans text-sm text-ink-500">You do not have any archived rounds available for video yet.</p>
      ) : (
        <div className="mt-8 space-y-7">
          {available.map(({ tournament, rounds }) => (
            <section key={tournament.slug}>
              <h2 className="font-serif text-xl font-bold text-ink-900">{tournament.editionLabel}</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {rounds.map((round) => (
                  <Link key={round.round} href={`/portal/round-video/${tournament.slug}/${round.round}`} className="rounded-xl border border-stone-300 bg-white px-4 py-3 shadow-sm transition hover:border-maroon-500 hover:shadow-md">
                    <p className="font-serif text-lg font-bold text-ink-900">Round {round.round} · {round.course}</p>
                    {round.format && <p className="mt-1 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{round.format}</p>}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
