// app/portal/admin/courses-format/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CoursesFormatPanel } from "@/components/portal/tiger/CoursesFormatPanel";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";

export default async function CoursesFormatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: settingsRow }, { data: roundRows }, { data: courseRows }] = await Promise.all([
    service.from("live_tournament_settings").select("round_count, completed_at").eq("id", true).maybeSingle(),
    service.from("live_round_state").select("round, started, course_id, date, format, course_locked, matchups_locked").order("round"),
    service.from("live_courses").select("id, name, holes, rating, slope").order("name"),
  ]);

  const settings: TournamentSettings = { roundCount: settingsRow?.round_count ?? null, completedAt: settingsRow?.completed_at ?? null };
  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    round: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
  }));
  const courses: LiveCourse[] = (courseRows ?? []).map((c) => ({ id: c.id, name: c.name, holes: c.holes, rating: c.rating, slope: c.slope }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Courses & Format</h1>
      <CoursesFormatPanel initialSettings={settings} initialRounds={rounds} initialCourses={courses} />
    </div>
  );
}
