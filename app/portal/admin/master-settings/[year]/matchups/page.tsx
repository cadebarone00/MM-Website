// app/portal/admin/master-settings/[year]/matchups/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { playerProfiles } from "@/lib/data/players";
import { MatchupsPanel, type RosterPlayer } from "@/components/portal/tiger/MatchupsPanel";
import type { LiveMatchBox, LiveRoundState, MatchFormat, MatchState } from "@/lib/live/types";

export default async function MatchupsPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: roundRows }, { data: boxRows }, { data: rosterRows }] = await Promise.all([
    service
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked")
      .eq("season_year", year)
      .order("round"),
    service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .order("round")
      .order("box_number"),
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
  ]);

  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    seasonYear: year,
    round: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
  }));

  const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((b) => ({
    id: b.id,
    seasonYear: year,
    round: b.round,
    boxNumber: b.box_number,
    format: b.format as MatchFormat,
    teeTime: new Date(b.tee_time),
    maroonPlayers: b.maroon_players,
    whitePlayers: b.white_players,
    state: b.state as MatchState,
    started: b.started,
  }));

  const nameBySlug = new Map(playerProfiles.map((p) => [p.slug, p.fullName]));
  const roster: RosterPlayer[] = (rosterRows ?? [])
    .filter((r) => nameBySlug.has(r.player_slug))
    .map((r) => ({ playerSlug: r.player_slug, fullName: nameBySlug.get(r.player_slug)!, team: r.team as "maroon" | "white" }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Matchups</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Assign players into match boxes for each round whose course and format are locked. Lock Matchups once a
        round is fully set to make it visible on the Website and Player Portals.
      </p>
      <MatchupsPanel year={year} rounds={rounds} initialMatchBoxes={matchBoxes} roster={roster} />
    </div>
  );
}
