import { GAMES, type GameId, type HoleInput } from "./roundGames.ts";
import type { TripGame } from "./tripGames.ts";

/**
 * Saved trip games (supabase/golf_trip_games.sql → get_trip_games) as the Games tab uses them. Rows are checked before
 * use; anything malformed is dropped. Players are kept by profile id and shown by trip display name.
 */
export interface SavedTripGame {
  id: string; roundNumber: number; gameType: GameId; net: boolean; birdiesDouble: boolean; teams: number[] | null; started: boolean; mine: boolean;
  players: { profileId: string; displayName: string }[]; picks: Record<number, HoleInput>; pars: number[] | null;
}

const isGame = (value: unknown): value is GameId => GAMES.some((g) => g.id === value);

export function savedTripGamesFromJson(value: unknown): SavedTripGame[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((row): SavedTripGame[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !Number.isInteger(r.roundNumber) || !isGame(r.gameType) || !Array.isArray(r.players)) return [];
    const players = r.players.flatMap((p) => p && typeof p === "object" && typeof (p as Record<string, unknown>).profileId === "string"
      ? [{ profileId: String((p as Record<string, unknown>).profileId), displayName: String((p as Record<string, unknown>).displayName ?? "Player") }] : []);
    const picks: Record<number, HoleInput> = {};
    if (r.picks && typeof r.picks === "object") for (const [hole, pick] of Object.entries(r.picks as Record<string, unknown>)) {
      const n = Number(hole);
      if (Number.isInteger(n) && n >= 1 && n <= 18 && pick && typeof pick === "object") picks[n] = pick as HoleInput;
    }
    const teams = Array.isArray(r.teams) && r.teams.every((t) => t === 0 || t === 1) ? r.teams as number[] : null;
    const pars = Array.isArray(r.pars) && r.pars.length === 18 && r.pars.every((p) => Number.isInteger(p)) ? r.pars as number[] : null;
    return [{ id: r.id, roundNumber: r.roundNumber as number, gameType: r.gameType, net: r.net === true, birdiesDouble: r.birdiesDouble === true,
      teams, started: r.started === true, mine: r.mine === true, players, picks, pars }];
  });
}

/** A saved game as the Games tab's TripGame (players by display name, picks by hole index), keeping its id. */
export function tripGameFromSaved(game: SavedTripGame): TripGame & { mine: boolean } {
  return {
    key: game.id, round: game.roundNumber, players: game.players.map((p) => p.displayName), started: game.started, mine: game.mine,
    pars: game.pars,
    inputs: Array.from({ length: 18 }, (_, h) => game.picks[h + 1] ?? {}),
    config: { id: game.gameType, net: game.net, birdiesDouble: game.birdiesDouble, ...(game.teams ? { teams: game.teams } : {}) },
  };
}

export type TripGameAction =
  | { action: "create"; round: number; requestId: string; game: { gameType: GameId; net: boolean; birdiesDouble: boolean; teams?: number[]; players: string[] } }
  | { action: "update"; gameId: string; patch: { teams?: number[]; started?: boolean } }
  | { action: "pick"; gameId: string; hole: number; pick: HoleInput | null }
  | { action: "delete"; gameId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teamsOk = (t: unknown): t is number[] => Array.isArray(t) && t.length >= 2 && t.length <= 5 && t.every((v) => v === 0 || v === 1);

/** Checks a Games request body (POST /api/golf-trips/[tripId]/games). The database checks who may do it. */
export function tripGameActionFromBody(body: unknown): { ok: true; value: TripGameAction } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const b = body as Record<string, unknown>;
  if (b.action === "create") {
    const g = b.game as Record<string, unknown> | undefined;
    if (!Number.isInteger(b.round) || (b.round as number) < 1 || (b.round as number) > 62 || typeof b.requestId !== "string" || !UUID.test(b.requestId)) return { ok: false, error: "Invalid request." };
    if (!g || !isGame(g.gameType) || !Array.isArray(g.players) || !g.players.every((p) => typeof p === "string" && UUID.test(p)) || g.players.length < 2 || g.players.length > 5) return { ok: false, error: "Pick a game and its players." };
    if (g.teams !== undefined && !teamsOk(g.teams)) return { ok: false, error: "Put each player on a team." };
    return { ok: true, value: { action: "create", round: b.round as number, requestId: b.requestId,
      game: { gameType: g.gameType, net: g.net === true, birdiesDouble: g.birdiesDouble === true, ...(g.teams ? { teams: g.teams as number[] } : {}), players: g.players as string[] } } };
  }
  if (typeof b.gameId !== "string" || !UUID.test(b.gameId)) return { ok: false, error: "Game not found." };
  if (b.action === "update") {
    const p = b.patch as Record<string, unknown> | undefined;
    if (!p || (p.teams !== undefined && !teamsOk(p.teams)) || (p.started !== undefined && p.started !== true)) return { ok: false, error: "Invalid request." };
    return { ok: true, value: { action: "update", gameId: b.gameId, patch: { ...(p.teams ? { teams: p.teams as number[] } : {}), ...(p.started ? { started: true } : {}) } } };
  }
  if (b.action === "pick") {
    if (!Number.isInteger(b.hole) || (b.hole as number) < 1 || (b.hole as number) > 18) return { ok: false, error: "Pick a hole from 1 to 18." };
    if (b.pick !== null && (typeof b.pick !== "object" || JSON.stringify(b.pick).length > 1000)) return { ok: false, error: "That pick couldn't be saved." };
    return { ok: true, value: { action: "pick", gameId: b.gameId, hole: b.hole as number, pick: b.pick as HoleInput | null } };
  }
  if (b.action === "delete") return { ok: true, value: { action: "delete", gameId: b.gameId } };
  return { ok: false, error: "Invalid request." };
}
