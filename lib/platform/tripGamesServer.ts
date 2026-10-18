import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { savedTripGamesFromJson, type SavedTripGame, type TripGameAction } from "./tripGamesRows.ts";

/**
 * Server-side saved trip games (supabase/golf_trip_games.sql). The player acting is always the signed-in profile,
 * never a value from the request. Never import this from a client component.
 */

type Answer = { ok: true; games: SavedTripGame[] } | { ok: false; status: number; error: string };

/** The database's own messages (raise exception) are written to be shown; anything else is a server problem. */
function failure(error: { code?: string; message?: string }): { ok: false; status: number; error: string } {
  if (error.code === "P0001" && error.message) return { ok: false, status: 400, error: error.message };
  if (error.code === "42883" || error.code === "42P01") return { ok: false, status: 503, error: "Games aren't set up yet." };
  return { ok: false, status: 500, error: "Couldn't save the game. Try again." };
}

function answer(data: unknown, error: { code?: string; message?: string } | null): Answer {
  if (error) return failure(error);
  if (data === null) return { ok: false, status: 404, error: "Trip not found." };
  const games = savedTripGamesFromJson(data);
  return games ? { ok: true, games } : { ok: false, status: 500, error: "Couldn't load games." };
}

/** Every game the signed-in player is in on this trip. */
export async function getTripGames(profileId: string, tripId: string): Promise<Answer> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_trip_games", { p_profile: profileId, p_trip: tripId });
  return answer(data, error);
}

/** Create / update / pick / delete, as the signed-in player. Answers with their games afterwards. */
export async function tripGameAction(profileId: string, tripId: string, action: TripGameAction): Promise<Answer> {
  const db = createSupabaseServiceRoleClient();
  const { data, error } = action.action === "create"
    ? await db.rpc("create_trip_game", { p_profile: profileId, p_trip: tripId, p_round_number: action.round, p_game: action.game, p_request: action.requestId })
    : action.action === "update" ? await db.rpc("update_trip_game", { p_profile: profileId, p_game: action.gameId, p_patch: action.patch })
    : action.action === "pick" ? await db.rpc("save_trip_game_pick", { p_profile: profileId, p_game: action.gameId, p_hole: action.hole, p_pick: action.pick })
    : await db.rpc("delete_trip_game", { p_profile: profileId, p_game: action.gameId });
  return answer(data, error);
}
