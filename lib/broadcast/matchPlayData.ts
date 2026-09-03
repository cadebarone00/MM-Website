// lib/broadcast/matchPlayData.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { pastTournaments } from "@/lib/data";
import type { RealMatch, Tournament } from "@/lib/data/types";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { effectiveMatchState, matchBoxResult, thruLabel } from "@/lib/live/orchestration";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { MatchState } from "@/lib/live/types";
import type { BroadcastTeam } from "./types";
import { buildLiveTournamentSnapshot } from "./liveSnapshot";

export interface BroadcastMatchBox {
  id: string | null;
  boxNumber: number;
  format: string;
  state: MatchState;
  thru: string;
  maroonNames: string[];
  whiteNames: string[];
  leader: BroadcastTeam | "tie";
  margin: number;
  holesRemaining: number;
  maroonPts: number;
  whitePts: number;
}

export interface BroadcastMatchPlay {
  seasonYear: number;
  roundLabel: string | null; // e.g. "Round 3" (live) or "Day 4" (archived) — null when there's nothing to show
  matchBoxes: BroadcastMatchBox[];
  /** Points won so far across the shown matches (clinched boxes only — an in-progress box contributes 0 either side until it closes, same convention lib/live/orchestration.ts's matchBoxResult already uses). */
  maroonPts: number;
  whitePts: number;
  /** True for an archived year's day (already finished) — the scene shows "Final" instead of "Live" against it. */
  final: boolean;
}

function sumPts(boxes: { maroonPts: number; whitePts: number }[]): { maroonPts: number; whitePts: number } {
  return boxes.reduce((sum, b) => ({ maroonPts: sum.maroonPts + b.maroonPts, whitePts: sum.whitePts + b.whitePts }), { maroonPts: 0, whitePts: 0 });
}

interface RoundStateRow {
  round: number;
  started: boolean;
}

/** The most relevant round for the Match Play scene: the highest-numbered started round, or null if none has started. */
function pickCurrentRound(rows: RoundStateRow[]): number | null {
  const started = rows.filter((r) => r.started).map((r) => r.round);
  return started.length === 0 ? null : Math.max(...started);
}

/**
 * `RealMatch.status` is never actually populated in the static per-year
 * data files (checked: no `2026-palm-springs.ts` match sets it) — every
 * archived match is undefined there, not "final". But everything in
 * `pastTournaments` is, by definition, a finished tournament, so the
 * correct default for a missing status here is Final, not Scheduled
 * (Scheduled would be actively misleading — it already happened).
 */
function archivedMatchState(status: RealMatch["status"]): MatchState {
  if (status === "live") return "Live";
  if (status === "scheduled") return "Scheduled";
  return "Final";
}

/** A finished tournament's real match results, for previewing the look (see the spec addendum on Broadcast Controls' display-year picker) — the most recent day's matches, since a whole event's worth in one scene would be too dense. */
function archivedMatchPlay(tournament: Tournament): BroadcastMatchPlay {
  if (tournament.matches.length === 0) return { seasonYear: tournament.year, roundLabel: null, matchBoxes: [], maroonPts: 0, whitePts: 0, final: true };

  const lastDay = Math.max(...tournament.matches.map((m) => m.day));
  const dayMatches = tournament.matches.filter((m) => m.day === lastDay);

  const matchBoxes: BroadcastMatchBox[] = dayMatches.map((m, i) => ({
    id: m.id,
    boxNumber: i + 1,
    format: m.format,
    state: archivedMatchState(m.status),
    thru: m.thru != null ? (m.thru >= 18 ? "Final" : `Thru ${m.thru}`) : "",
    maroonNames: m.maroonPlayers.map(getPlayerDisplayName),
    whiteNames: m.whitePlayers.map(getPlayerDisplayName),
    // `RealMatch.leader` isn't actually populated in the static data files
    // either (checked, same as `status` above) — derived from the real
    // points instead, same as the live path's matchBoxResult() does.
    leader: m.maroonPts > m.whitePts ? "maroon" : m.whitePts > m.maroonPts ? "white" : "tie",
    margin: m.margin ?? 0,
    holesRemaining: m.holesRemaining ?? 0,
    maroonPts: m.maroonPts,
    whitePts: m.whitePts,
  }));

  const { maroonPts, whitePts } = sumPts(matchBoxes);
  return { seasonYear: tournament.year, roundLabel: `Day ${lastDay}`, matchBoxes, maroonPts, whitePts, final: true };
}

async function liveMatchPlay(seasonYear: number): Promise<BroadcastMatchPlay> {
  const service = createSupabaseServiceRoleClient();

  const { data: roundRows } = await service.from("live_round_state").select("round, started").eq("season_year", seasonYear);
  const round = pickCurrentRound((roundRows as RoundStateRow[] | null) ?? []);
  if (round === null) return { seasonYear, roundLabel: null, matchBoxes: [], maroonPts: 0, whitePts: 0, final: false };

  const snapshot = await buildLiveTournamentSnapshot(seasonYear);
  const boxes = snapshot.matchBoxes.filter((box) => box.round === round).sort((a, b) => a.boxNumber - b.boxNumber);

  const matchBoxes: BroadcastMatchBox[] = boxes.map((box) => {
    const state = effectiveMatchState(snapshot, box);
    const result = matchBoxResult(snapshot, box);
    return {
      id: box.id,
      boxNumber: box.boxNumber,
      format: box.format,
      state,
      thru: state === "Scheduled" ? "" : thruLabel(snapshot, box),
      maroonNames: box.maroonPlayers.map(getPlayerDisplayName),
      whiteNames: box.whitePlayers.map(getPlayerDisplayName),
      leader: result.leader,
      margin: result.margin,
      holesRemaining: result.holesRemaining,
      maroonPts: result.maroonPts,
      whitePts: result.whitePts,
    };
  });

  const { maroonPts, whitePts } = sumPts(matchBoxes);
  return { seasonYear, roundLabel: `Round ${round}`, matchBoxes, maroonPts, whitePts, final: false };
}

/**
 * Same live-vs-archived split as lib/broadcast/leaderboardData.ts — see
 * that file's comment for why the branch is by year, not a config flag.
 * `overrideYear` is for the Broadcast Controls preview only, same as
 * getBroadcastLeaderboard's.
 */
export async function getBroadcastMatchPlay(overrideYear?: number): Promise<BroadcastMatchPlay> {
  const seasonYear = overrideYear ?? (await getBroadcastDisplayYear());

  const archived = pastTournaments.find((t) => t.year === seasonYear);
  if (archived) return archivedMatchPlay(archived);

  return liveMatchPlay(seasonYear);
}
