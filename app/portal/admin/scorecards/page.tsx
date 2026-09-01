import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pastTournaments, latestCompleted, playersOf } from "@/lib/data";
import { getPlayerDisplayName, getPlayerProfile } from "@/lib/data/players";
import { YearPicker } from "@/components/portal/tiger/YearPicker";

export default async function ScorecardsYearPickerPage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug } = await searchParams;
  const activeTournament = pastTournaments.find((t) => t.slug === tournamentSlug) ?? latestCompleted;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Scorecards & Video</h1>

      <div className="relative mt-4 inline-block">
        <YearPicker options={[...pastTournaments].reverse().map((t) => ({ slug: t.slug, year: t.year }))} value={activeTournament.slug} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {playersOf(activeTournament).map(({ name, team }) => {
          const slug = getPlayerProfile(name)?.slug;
          if (!slug) return null;
          return (
            <Link
              key={name}
              href={`/portal/admin/scorecards/${activeTournament.slug}/${slug}`}
              className={[
                "rounded-lg border-2 px-3 py-4 text-center font-serif text-sm font-bold transition",
                team === "maroon" ? "border-maroon-700 bg-maroon-50 text-maroon-700 hover:bg-maroon-100" : "border-ink-300 bg-white text-ink-900 hover:bg-cream-100",
              ].join(" ")}
            >
              {getPlayerDisplayName(name)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
