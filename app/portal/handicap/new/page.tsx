import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCourseLibraryForHandicap, getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { HandicapRoundWizard } from "@/components/portal/handicap/HandicapRoundWizard";
import { getPlayerProfileBySlug } from "@/lib/data/players";

const MAX_RECENT_COURSES = 8;

/** Most-recently-played course IDs for this player, newest first, no duplicates. */
function recentCourseIds(rounds: { courseId: string }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const round of rounds) {
    if (seen.has(round.courseId)) continue;
    seen.add(round.courseId);
    ids.push(round.courseId);
    if (ids.length === MAX_RECENT_COURSES) break;
  }
  return ids;
}

export default async function NewHandicapRoundPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const [courses, summary] = await Promise.all([
    getCourseLibraryForHandicap(),
    getHandicapSummaryForPlayer(profile.player_slug!),
  ]);

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-7">
      <Link href="/portal/handicap" className="hidden lg:inline-block font-condensed text-xs font-bold uppercase tracking-wide text-ink-500 hover:text-maroon-700">
        ← Back to My Handicap
      </Link>
      <div className="mt-5">
        <HandicapRoundWizard courses={courses} recentCourseIds={recentCourseIds(summary.rounds)} playerName={getPlayerProfileBySlug(profile.player_slug!)?.fullName} />
      </div>
    </div>
  );
}
