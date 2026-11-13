import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { League, LeagueCourse, LeagueLookup, LeagueScoring, MyLeague } from "./leagues.ts";
import type { GameConfig, HoleInput } from "./roundGames.ts";

/**
 * Leagues (supabase/leagues.sql). Profile ids always come from the signed-in session — callers pass `user.id`, never a
 * value from the request body. Never import this from a client component.
 * "not_installed" = leagues.sql hasn't been run in this database yet.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; code: "not_installed" | "refused" | "failed"; message?: string };

const db = () => createSupabaseServiceRoleClient();
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await db().rpc(name, args);
  if (!error) return { ok: true, value: data as T };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { ok: false, code: "not_installed" };
  // 42501 = not allowed, 22023 = bad request: the message is written for players.
  if (error.code === "42501" || error.code === "22023") return { ok: false, code: "refused", message: error.message };
  console.error(`${name} failed:`, error.message);
  return { ok: false, code: "failed" };
}

export const createLeague = (organizer: string, name: string, course: LeagueCourse, date: string, scoring: LeagueScoring, plays: boolean, handicap: number | null) =>
  rpc<{ id: string; code: string }>("create_league", { p_organizer: organizer, p_name: name, p_course: course, p_date: date, p_scoring: scoring, p_plays: plays, p_handicap: handicap });
export const findLeague = (me: string, code: string) => rpc<LeagueLookup | null>("find_league", { p_profile: me, p_code: code });
export const joinLeague = (me: string, code: string, handicap: number | null) => rpc<string>("join_league", { p_profile: me, p_code: code, p_handicap: handicap });
export const getLeague = (me: string, id: string) => rpc<League | null>("get_league", { p_profile: me, p_league: id });
export const listMyLeagues = (me: string) => rpc<MyLeague[]>("list_my_leagues", { p_profile: me });
export const setLeagueSettings = (organizer: string, id: string, scoring: LeagueScoring, skins: League["skins"], pairs: League["pairs"]) =>
  rpc<null>("set_league_settings", { p_organizer: organizer, p_league: id, p_scoring: scoring, p_skins: skins, p_pairs: pairs });
export const setLeagueGroups = (organizer: string, id: string, groups: { time: string; hole: number; scorer: string; players: string[] }[]) =>
  rpc<null>("set_league_groups", { p_organizer: organizer, p_league: id, p_groups: groups });
export const setLeagueStrokes = (me: string, id: string, player: string, hole: number, strokes: number | null) =>
  rpc<null>("set_league_strokes", { p_profile: me, p_league: id, p_player: player, p_hole: hole, p_strokes: strokes });
export const setLeagueGroupGame = (me: string, id: string, group: number, game: GameConfig | null, inputs: HoleInput[]) =>
  rpc<null>("set_league_group_game", { p_profile: me, p_league: id, p_group: group, p_game: game, p_inputs: inputs });
export const submitLeagueGroup = (me: string, id: string, group: number) => rpc<null>("submit_league_group", { p_profile: me, p_league: id, p_group: group });
export const endLeague = (organizer: string, id: string) => rpc<null>("end_league", { p_organizer: organizer, p_league: id });
export const deleteLeague = (organizer: string, id: string) => rpc<null>("delete_league", { p_organizer: organizer, p_league: id });
export const copyLeague = (organizer: string, id: string, date: string) => rpc<{ id: string; code: string }>("copy_league", { p_organizer: organizer, p_league: id, p_date: date });
