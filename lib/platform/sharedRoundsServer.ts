import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PersonalRoundSetup } from "./personalRound.ts";
import type { HoleInput } from "./roundGames.ts";

/**
 * Invite-only shared rounds (supabase/shared_rounds.sql). Profile ids always come from the signed-in session — callers
 * pass `user.id`, never a value from the request body. Never import this from a client component.
 * "not_installed" = shared_rounds.sql hasn't been run in this database yet.
 */

export type SharedPlayerStatus = "invited" | "joined" | "declined" | "removed";
export interface SharedRound {
  id: string; host: string; status: "live" | "ended"; setup: PersonalRoundSetup; startedAt: string;
  players: { profileId: string; name: string; position: number; status: SharedPlayerStatus }[];
  holes: { profileId: string; hole: number; strokes: number | null }[];
  picks: { hole: number; pick: HoleInput }[];
}
export interface RoundInvite { roundId: string; hostName: string; setup: PersonalRoundSetup; startedAt: string }
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

export const createSharedRound = (host: string, setup: PersonalRoundSetup, invites: string[]) =>
  rpc<string>("create_shared_round", { p_host: host, p_setup: setup, p_invites: invites });
export const getSharedRound = (me: string, round: string) => rpc<SharedRound | null>("get_shared_round", { p_profile: me, p_round: round });
export const myLiveSharedRound = (me: string) => rpc<string | null>("my_live_shared_round", { p_profile: me });
export const listMyRoundInvites = (me: string) => rpc<RoundInvite[]>("list_my_round_invites", { p_profile: me });
export const answerRoundInvite = (me: string, round: string, join: boolean) => rpc<null>("answer_shared_round_invite", { p_profile: me, p_round: round, p_join: join });
export const inviteToSharedRound = (host: string, round: string, profile: string) => rpc<null>("invite_to_shared_round", { p_host: host, p_round: round, p_profile: profile });
export const removeFromSharedRound = (host: string, round: string, profile: string) => rpc<null>("remove_from_shared_round", { p_host: host, p_round: round, p_profile: profile });
export const setSharedStrokes = (me: string, round: string, player: string, hole: number, strokes: number | null) =>
  rpc<null>("set_shared_round_strokes", { p_profile: me, p_round: round, p_player: player, p_hole: hole, p_strokes: strokes });
export const setSharedPick = (me: string, round: string, hole: number, pick: HoleInput) => rpc<null>("set_shared_round_pick", { p_profile: me, p_round: round, p_hole: hole, p_pick: pick });
export const updateSharedRound = (host: string, round: string, setup: PersonalRoundSetup | null, end: boolean) =>
  rpc<null>("update_shared_round", { p_host: host, p_round: round, p_setup: setup, p_end: end });

/** Invite search: other accounts whose name or username matches (never me), just id + names. */
export async function searchAccounts(meId: string, query: string): Promise<{ id: string; name: string; username: string }[]> {
  const text = query.trim().replace(/[%_,()]/g, "");
  if (text.length < 2) return [];
  const { data, error } = await db().from("profiles").select("id, display_name, username")
    .or(`display_name.ilike.%${text}%,username.ilike.%${text}%`).neq("id", meId).limit(8);
  if (error) { console.error("Account search failed:", error.message); return []; }
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.display_name as string, username: row.username as string }));
}
