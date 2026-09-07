import type { BroadcastScene, BroadcastVideoPhase } from "./types";
import type { BroadcastStanding } from "./types";
import type { BroadcastTeam } from "./types";
import type { BroadcastMatchPlay } from "./matchPlayData";

// Two complete one-minute rehearsal cycles. The short transition is kept at
// the same four seconds used by the real player-video workflow.
export const MOCK_RUN_PREFIX_MS = 44_000;
export const MOCK_RUN_DEFAULT_VIDEO_MS = 16_000;

export function getMockRunCycleMs(videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS) {
  return MOCK_RUN_PREFIX_MS + Math.max(1_000, videoDurationMs);
}

export function getMockRunTotalMs(videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS) {
  return getMockRunCycleMs(videoDurationMs) * 2;
}

export type MockRunPosition = {
  scene: BroadcastScene;
  videoPhase: BroadcastVideoPhase | null;
  cycle: number;
};

const MOCK_PLAYERS = [
  ["Cade", "white"], ["Collin", "white"], ["Jackson", "white"], ["Kyle", "white"], ["Quez", "white"], ["Dalton", "white"],
  ["Cam", "maroon"], ["Drew", "maroon"], ["Hugo", "maroon"], ["Luke", "maroon"], ["Nate", "maroon"], ["Pete", "maroon"],
] as const;

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledPlayers(seed: number) {
  const take = random(seed);
  return MOCK_PLAYERS.map(([player, team]) => ({ player, team })).sort(() => take() - 0.5);
}

export function getMockFormat(seed: number): "Singles" | "Fourball" | "Foursome" {
  return ["Singles", "Fourball", "Foursome"][Math.abs(seed) % 3] as "Singles" | "Fourball" | "Foursome";
}

export function getMockStandings(seed: number, scoreChangeApplied: boolean, cycle: number): { standings: BroadcastStanding[]; eventPlayer: string; eventKind: "birdie" | "bogey" } {
  const players = shuffledPlayers(seed + cycle * 71);
  const eventKind = Math.abs(seed + cycle * 13) % 3 === 0 ? "bogey" : "birdie";
  const moverIndex = eventKind === "birdie" ? 2 + (Math.abs(seed + cycle) % 5) : Math.abs(seed + cycle) % 3;
  const eventPlayer = players[moverIndex]?.player ?? players[2].player;
  const standings = players.map((entry, index) => ({ ...entry, toPar: -6 + index }));
  if (scoreChangeApplied) {
    const mover = standings.find((entry) => entry.player === eventPlayer);
    if (mover) mover.toPar = eventKind === "birdie" ? -7 : 7;
  }
  return { standings: standings.sort((a, b) => a.toPar - b.toPar), eventPlayer, eventKind };
}

export function getMockMatchPlay(seed: number): BroadcastMatchPlay {
  const players = shuffledPlayers(seed);
  const format = getMockFormat(seed);
  const perSide = format === "Singles" ? 1 : 2;
  const matchCount = format === "Singles" ? 6 : 3;
  const take = random(seed + 443);
  const matchBoxes = Array.from({ length: matchCount }, (_, index) => {
    const start = index * perSide;
    const maroonNames = players.filter((player) => player.team === "maroon").slice(start, start + perSide).map((player) => player.player);
    const whiteNames = players.filter((player) => player.team === "white").slice(start, start + perSide).map((player) => player.player);
    const leaderRoll = take();
    const leader: BroadcastTeam | "tie" = leaderRoll < 0.38 ? "maroon" : leaderRoll < 0.76 ? "white" : "tie";
    const margin = leader === "tie" ? 0 : 1 + Math.floor(take() * 3);
    const thru = 7 + Math.floor(take() * 9);
    return {
      id: `mock-${index + 1}`, boxNumber: index + 1, format, state: "Live" as const, thru: `Thru ${thru}`,
      maroonNames, whiteNames, leader, margin, holesRemaining: 18 - thru, maroonPts: 0, whitePts: 0,
    };
  });
  return { seasonYear: 2034, roundLabel: `Round ${1 + (Math.abs(seed) % 8)} · ${format}`, matchBoxes, maroonPts: 0, whitePts: 0, final: false };
}

export function getMockRunPosition(elapsedMs: number, videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS): MockRunPosition {
  const cycleMs = getMockRunCycleMs(videoDurationMs);
  const cycle = Math.min(1, Math.floor(Math.max(0, elapsedMs) / cycleMs));
  const time = Math.max(0, elapsedMs) % cycleMs;

  if (time < 14_000) return { scene: "individual_leaderboard", videoPhase: null, cycle };
  if (time < 28_000) return { scene: "match_play", videoPhase: null, cycle };
  if (time < 40_000) return { scene: "holding", videoPhase: null, cycle };
  if (time < 44_000) return { scene: "holding", videoPhase: "transition", cycle };
  return { scene: "holding", videoPhase: "playing", cycle };
}
