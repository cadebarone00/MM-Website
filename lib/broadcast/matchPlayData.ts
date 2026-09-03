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
}

export interface BroadcastMatchPlay {
  seasonYear: number;
  roundLabel: string | null; // e.g. "Round 3" (live) or "Day 4" (archived) — null when there's nothing to show
  matchBoxes: BroadcastMatchBox[];
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

function archivedMatchState(status: RealMatch["status"]): MatchState {
  if (status === "final") return "Final";
  if (status === "live") return "Live";
  return "Scheduled";
}

/** A finished tournament's real match results, for previewing the look (see the spec addendum on Broadcast Controls' display-year picker) — the most recent day's matches, since a whole event's worth in one scene would be too dense. */
function archivedMatchPlay(tournament: Tournament): BroadcastMatchPlay {
  if (tournament.matches.length === 0) return { seasonYear: tournament.year, roundLabel: null, matchBoxes: [] };

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
    leader: (m.leader ?? "tie") as BroadcastTeam | "tie",
    margin: m.margin ?? 0,
    holesRemaining: m.holesRemaining ?? 0,
  }));

  return { seasonYear: tournament.year, roundLabel: `Day ${lastDay}`, matchBoxes };
}

async function liveMatchPlay(seasonYear: number): Promise<BroadcastMatchPlay> {
  const service = createSupabaseServiceRoleClient();

  const { data: roundRows } = await service.from("live_round_state").select("round, started").eq("season_year", seasonYear);
  const round = pickCurrentRound((roundRows as RoundStateRow[] | null) ?? []);
  if (round === null) return { seasonYear, roundLabel: null, matchBoxes: [] };

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
    };
  });

  return { seasonYear, roundLabel: `Round ${round}`, matchBoxes };
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
