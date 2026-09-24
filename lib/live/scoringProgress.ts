// lib/live/scoringProgress.ts
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CurrentRoundResult } from "./currentRoundForPlayer.ts";
import { submittedPair, type HoleDraft, type HoleSubmission } from "./holeSubmission.ts";
import { liveRoundStatus, waitingOnSubmitters, type RoundCardState } from "./roundStatus.ts";

const HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1 }));

export interface ScoringProgress {
  holesEntered: number;
  roundCard: RoundCardState;
  iSubmitted: boolean;
  /** Player slugs still to submit, excluding the player themselves. */
  waitingOn: string[];
  courseName: string | null;
}

// Not unit tested: it needs a real request lifecycle (same documented limitation as findMatchesForPlayer).
// The decisions it feeds are tested: liveRoundStatus, waitingOnSubmitters and scoringStage.
export async function loadScoringProgress(result: CurrentRoundResult, playerSlug: string): Promise<ScoringProgress> {
  const boxId = result.matchBox.id;
  const courseId = result.round.courseId;
  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceRoleClient();
  const [holeRows, submittedRows, course] = await Promise.all([
    boxId ? supabase.from("live_hole_submissions").select("player_slug, hole, payload, submitted_at").eq("match_box_id", boxId) : Promise.resolve({ data: [] }),
    boxId ? supabase.from("live_match_box_submissions").select("player_slug").eq("match_box_id", boxId) : Promise.resolve({ data: [] }),
    courseId ? service.from("live_courses").select("name").eq("id", courseId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const submissions: HoleSubmission[] = (holeRows.data ?? []).map((row) => ({ ...(row.payload as HoleDraft), player: row.player_slug as string, hole: row.hole as number, submittedAt: row.submitted_at as string }));
  const submitted = (submittedRows.data ?? []).map((row) => row.player_slug as string);
  const status = liveRoundStatus(result.matchBox, playerSlug, HOLES, submissions);
  return {
    holesEntered: HOLES.filter((hole) => submittedPair(result.matchBox, playerSlug, hole.number, submissions).mine).length,
    roundCard: status.state,
    iSubmitted: submitted.includes(playerSlug),
    waitingOn: waitingOnSubmitters(result.matchBox, playerSlug, submitted).filter((slug) => slug !== playerSlug),
    courseName: (course.data as { name: string } | null)?.name ?? null,
  };
}
