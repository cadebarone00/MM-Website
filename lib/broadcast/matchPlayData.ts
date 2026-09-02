// lib/broadcast/matchPlayData.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { effectiveMatchState, matchBoxResult, thruLabel } from "@/lib/live/orchestration";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { MatchState, Team } from "@/lib/live/types";
import { buildLiveTournamentSnapshot } from "./liveSnapshot";

export interface BroadcastMatchBox {
  id: string;
  boxNumber: number;
  format: string;
  state: MatchState;
  thru: string;
  maroonNames: string[];
  whiteNames: string[];
  leader: Team | "tie";
  margin: number;
  holesRemaining: number;
}

export interface BroadcastMatchPlay {
  seasonYear: number;
  round: number | null; // the round shown, or null if no round has started yet
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

export async function getBroadcastMatchPlay(): Promise<BroadcastMatchPlay> {
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: roundRows } = await service.from("live_round_state").select("round, started").eq("season_year", seasonYear);
  const round = pickCurrentRound((roundRows as RoundStateRow[] | null) ?? []);
  if (round === null) return { seasonYear, round: null, matchBoxes: [] };

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

  return { seasonYear, round, matchBoxes };
}
