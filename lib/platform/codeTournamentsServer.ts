import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CodeRoundSetup, CodeTournament, CodeTournamentLookup, MyCodeTournament, TeeSheet, TournamentCut } from "./codeTournaments.ts";

/**
 * Tournaments by code (supabase/tournament_codes.sql). Profile ids always come from the signed-in session — callers pass
 * `user.id`, never a value from the request body. Never import this from a client component.
 * "not_installed" = tournament_codes.sql hasn't been run in this database yet.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; code: "not_installed" | "refused" | "failed"; message?: string };
export type NewRound = { setup: CodeRoundSetup; date: string };

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

export const createCodeTournament = (organizer: string, name: string, scoring: "Gross" | "Net", plays: boolean, handicap: number | null, rounds: NewRound[]) =>
  rpc<{ id: string; code: string }>("create_code_tournament", { p_organizer: organizer, p_name: name, p_scoring: scoring, p_plays: plays, p_handicap: handicap, p_rounds: rounds });
export const addCodeTournamentRound = (organizer: string, id: string, round: NewRound) =>
  rpc<number>("add_code_tournament_round", { p_organizer: organizer, p_tournament: id, p_setup: round.setup, p_date: round.date });
export const findCodeTournament = (me: string, code: string) => rpc<CodeTournamentLookup | null>("find_code_tournament", { p_profile: me, p_code: code });
export const joinCodeTournament = (me: string, code: string, handicap: number | null) => rpc<string>("join_code_tournament", { p_profile: me, p_code: code, p_handicap: handicap });
export const getCodeTournament = (me: string, id: string) => rpc<CodeTournament | null>("get_code_tournament", { p_profile: me, p_tournament: id });
export const listMyCodeTournaments = (me: string) => rpc<MyCodeTournament[]>("list_my_code_tournaments", { p_profile: me });
export const setCodeTournamentStrokes = (me: string, id: string, round: number, hole: number, strokes: number | null) =>
  rpc<null>("set_code_tournament_strokes", { p_profile: me, p_tournament: id, p_round: round, p_hole: hole, p_strokes: strokes });
export const submitCodeTournamentCard = (me: string, id: string, round: number) => rpc<null>("submit_code_tournament_card", { p_profile: me, p_tournament: id, p_round: round });
/** supabase/tournament_cuts.sql. Null = no cut. */
export const setCodeTournamentCut = (organizer: string, id: string, cut: TournamentCut | null) =>
  rpc<null>("set_code_tournament_cut", { p_organizer: organizer, p_tournament: id, p_cut: cut });
/** supabase/tournament_tee_sheets.sql. */
export const setCodeTournamentTeeSheet = (organizer: string, id: string, round: number, sheet: TeeSheet) =>
  rpc<null>("set_code_tournament_tee_sheet", { p_organizer: organizer, p_tournament: id, p_round: round, p_sheet: sheet });
export const endCodeTournament = (organizer: string, id: string) => rpc<null>("end_code_tournament", { p_organizer: organizer, p_tournament: id });
