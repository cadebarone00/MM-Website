// app/portal/admin/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { YearAndMasterSettingsNav } from "@/components/portal/tiger/YearAndMasterSettingsNav";
import { StartRoundBanner, type StartableRound } from "@/components/portal/tiger/StartRoundBanner";

export default async function TigerCenterPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const activeYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const [{ data: roundRows }, { data: courseRows }] = await Promise.all([
    service
      .from("live_round_state")
      .select("round, date, format, course_id, course_locked, matchups_locked, started")
      .eq("season_year", activeYear)
      .order("round"),
    service.from("live_courses").select("id, name"),
  ]);
  const courseNameById = new Map((courseRows ?? []).map((c) => [c.id, c.name as string]));
  const nextRound = (roundRows ?? []).find((r) => r.course_locked && r.matchups_locked && !r.started);
  const startable: StartableRound | null = nextRound
    ? { year: activeYear, round: nextRound.round, format: nextRound.format ?? "", courseName: nextRound.course_id ? courseNameById.get(nextRound.course_id) ?? null : null, date: nextRound.date }
    : null;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">The Tiger Center</h1>
      {startable && <StartRoundBanner round={startable} />}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <YearAndMasterSettingsNav initialYear={activeYear} />
        <div className="flex flex-col gap-4 self-end">
          <Link
            href="/portal/admin/career-stats"
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            Career Stats
          </Link>
          <Link
            href="/portal/admin/wager-types"
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            Wager Types
          </Link>
          <Link
            href="/portal/admin/odds-model"
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            Odds Model
          </Link>
          <Link
            href="/portal/admin/broadcast-controls"
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            Broadcast Controls
          </Link>
        </div>
      </div>
      <Link
        href="/portal/admin/wagers"
        className="mt-8 block font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
      >
        MM Coins Settlement →
      </Link>
    </div>
  );
}
