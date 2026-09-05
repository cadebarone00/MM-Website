// app/portal/admin/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { YearAndMasterSettingsNav } from "@/components/portal/tiger/YearAndMasterSettingsNav";
import { StartRoundBanner, type StartableRound } from "@/components/portal/tiger/StartRoundBanner";
import { MatchCloseoutCards } from "@/components/portal/tiger/MatchCloseoutCards";
import { TestSeasonPanel } from "@/components/portal/tiger/TestSeasonPanel";

export default async function TigerCenterPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const activeYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const [{ data: roundRows }, { data: courseRows }] = await Promise.all([
    service.from("live_round_state").select("round, date, format, course_id, course_locked, matchups_locked, started").eq("season_year", activeYear).order("round"),
    service.from("live_courses").select("id, name"),
  ]);
  const courseNameById = new Map((courseRows ?? []).map((course) => [course.id, course.name as string]));
  const nextRound = (roundRows ?? []).find((round) => round.course_locked && round.matchups_locked && !round.started);
  const startable: StartableRound | null = nextRound ? { year: activeYear, round: nextRound.round, format: nextRound.format ?? "", courseName: nextRound.course_id ? courseNameById.get(nextRound.course_id) ?? null : null, date: nextRound.date } : null;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">The Tiger Center</h1>
      <TestSeasonPanel activeYear={activeYear} />
      {startable && <StartRoundBanner round={startable} />}
      <MatchCloseoutCards />
      <section className="mt-6 rounded-xl border border-gold-300 bg-cream-50 p-5">
        <p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Year-Specific Setup</p>
        <h2 className="mt-1 font-serif text-2xl font-bold text-ink-900">{activeYear} tournament operations</h2>
        <p className="mt-1 font-sans text-sm text-ink-600">Roster, teams, dates, courses, formats, tee times, and matchups belong to one selected season.</p>
        <div className="mt-4"><YearAndMasterSettingsNav initialYear={activeYear} /></div>
      </section>

      <section className="mt-6">
        <p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Global Tools</p>
        <h2 className="mt-1 font-serif text-2xl font-bold text-ink-900">Shared archive, models, and presentation</h2>
        <p className="mt-1 font-sans text-sm text-ink-600">These tools are not a season setup screen. They use the Career Archive, coded wager rules, and the active live data only where their individual page explicitly says so.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/portal/admin/career-stats" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Career Stats</Link>
          <Link href="/portal/admin/wager-types" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Wager Types</Link>
          <Link href="/portal/admin/odds-model" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Odds Model</Link>
          <Link href="/portal/admin/broadcast-controls" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Broadcast Controls</Link>
        </div>
      </section>
    </div>
  );
}
