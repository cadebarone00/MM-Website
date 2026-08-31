// lib/data/archivedScorecards.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { HoleStat, PlayerScorecard, RoundScorecard, Team, Tournament } from "./types";
import { playerProfiles } from "./players";

interface RoundRow {
  id: string;
  player_slug: string;
  round: number;
  course: string;
  format: string | null;
}

interface HoleRow {
  round_id: string;
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: string;
  gir: boolean;
}

function toHoleStat(row: HoleRow): HoleStat {
  return {
    hole: row.hole,
    par: row.par,
    yards: row.yards,
    score: row.score,
    putts: row.putts,
    fir: row.fir === "X" ? "X" : Number(row.fir),
    gir: row.gir ? 1 : 0,
    diff: row.score - row.par,
  };
}

function toRoundScorecard(round: RoundRow, holes: HoleRow[]): RoundScorecard {
  const holeStats = holes.filter((h) => h.round_id === round.id).sort((a, b) => a.hole - b.hole).map(toHoleStat);
  const played = holeStats.filter((h) => h.score > 0);
  const firApplicable = holeStats.filter((h) => h.fir !== "X");
  return {
    round: round.round,
    course: round.course,
    format: round.format ?? undefined,
    total: played.reduce((s, h) => s + h.score, 0),
    toPar: played.reduce((s, h) => s + (h.score - h.par), 0),
    putts: played.reduce((s, h) => s + h.putts, 0),
    girHit: holeStats.filter((h) => h.gir === 1).length,
    girTotal: holeStats.length,
    firHit: firApplicable.filter((h) => h.fir === 1).length,
    firTotal: firApplicable.length,
    holes: holeStats,
  };
}

function teamFor(roster: Tournament["roster"], playerId: string): Team {
  return roster.maroon.some((n) => n.toLowerCase() === playerId.toLowerCase()) ? "maroon" : "white";
}

/**
 * Every player's full scorecard for a played tournament, sourced from the
 * database — this is what gets attached as `Tournament.scorecards` at the
 * two public pages that need it (Task 4), replacing the old hardcoded
 * `scorecards2025`/`scorecards2026` file imports.
 */
export async function getScorecardsForTournament(tournament: Pick<Tournament, "slug" | "roster">): Promise<PlayerScorecard[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRows, error: roundsError } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournament.slug);
  if (roundsError) {
    console.error("getScorecardsForTournament: failed to load rounds", roundsError);
  }
  const rounds = (roundRows ?? []) as RoundRow[];
  if (rounds.length === 0) return [];

  const { data: holeRows, error: holesError } = await service
    .from("archived_scorecard_holes")
    .select("round_id, hole, par, yards, score, putts, fir, gir")
    .in("round_id", rounds.map((r) => r.id));
  if (holesError) {
    console.error("getScorecardsForTournament: failed to load holes", holesError);
  }
  const holes = (holeRows ?? []) as HoleRow[];

  const bySlug = new Map<string, RoundRow[]>();
  for (const round of rounds) {
    const arr = bySlug.get(round.player_slug) ?? [];
    arr.push(round);
    bySlug.set(round.player_slug, arr);
  }

  return [...bySlug.entries()].map(([slug, playerRounds]) => {
    const profile = playerProfiles.find((p) => p.slug === slug);
    const playerId = profile?.id ?? slug;
    return {
      player: playerId,
      team: teamFor(tournament.roster, playerId),
      rounds: playerRounds.sort((a, b) => a.round - b.round).map((r) => toRoundScorecard(r, holes)),
    };
  });
}

/** Round labels for the Tiger Center's player → rounds list ("Round 1 — Palmer"). */
export async function getArchivedRoundLabels(
  tournamentSlug: string,
  playerSlug: string
): Promise<{ round: number; course: string; format: string | null }[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("archived_scorecard_rounds")
    .select("round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .order("round");
  if (error) {
    console.error("getArchivedRoundLabels: failed to load round labels", error);
  }
  return data ?? [];
}

/** One round's full hole-by-hole scorecard — used by both the public page and the Tiger Center editor. */
export async function getArchivedRoundScorecard(tournamentSlug: string, playerSlug: string, round: number): Promise<RoundScorecard | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) {
    console.error("getArchivedRoundScorecard: failed to load round", roundError);
  }
  if (!roundRow) return null;

  const { data: holeRows, error: holesError } = await service
    .from("archived_scorecard_holes")
    .select("round_id, hole, par, yards, score, putts, fir, gir")
    .eq("round_id", roundRow.id);
  if (holesError) {
    console.error("getArchivedRoundScorecard: failed to load holes", holesError);
  }

  return toRoundScorecard(roundRow as RoundRow, (holeRows ?? []) as HoleRow[]);
}

/** hole -> shot number -> public video URL, for a round. Empty object if nothing's uploaded yet. */
export async function getShotVideoUrls(tournamentSlug: string, playerSlug: string, round: number): Promise<Record<number, Record<number, string>>> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) {
    console.error("getShotVideoUrls: failed to load round", roundError);
  }
  if (!roundRow) return {};

  const { data: videoRows, error: videosError } = await service
    .from("archived_shot_videos")
    .select("hole, shot_number, storage_path")
    .eq("round_id", roundRow.id);
  if (videosError) {
    console.error("getShotVideoUrls: failed to load videos", videosError);
  }

  const result: Record<number, Record<number, string>> = {};
  for (const row of videoRows ?? []) {
    const { data: publicUrl } = service.storage.from("shot-videos").getPublicUrl(row.storage_path);
    result[row.hole] = result[row.hole] ?? {};
    result[row.hole][row.shot_number] = publicUrl.publicUrl;
  }
  return result;
}
