import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCodeTournament } from "./codeTournamentsServer.ts";
import type { SavedGolfTrip } from "./golfTripCreate.ts";
import { withMemberPhotos } from "./golfTripsServer.ts";
import { setupForViewer } from "./savedTripSetup.ts";
import { loadSavedTripSetup } from "./savedTripSetupServer.ts";
import { getTripRoundScoring } from "./tripScoringServer.ts";
import { spectatorTournament, spectatorTrip, type WatchView } from "./watchView.ts";

/**
 * Watch codes (supabase/watch_codes.sql): anyone with the code, signed in or not, gets a read-only view. The server
 * reads as the organizer (service-role key) and strips the reply (lib/platform/watchView.ts) before it leaves.
 * Never import this from a client component.
 */

export type WatchLoad = { status: "ok"; view: WatchView } | { status: "missing" } | { status: "not_installed" } | { status: "failed" };

export async function loadWatch(code: string, today = new Date().toISOString().slice(0, 10)): Promise<WatchLoad> {
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db.rpc("find_watch_code", { p_code: code });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { status: "not_installed" };
    console.error("find_watch_code failed:", error.message);
    return { status: "failed" };
  }
  const found = data as { kind: "tournament" | "trip"; id: string; organizer: string | null } | null;
  if (!found?.organizer) return { status: "missing" };
  const watchId = `watch-${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

  if (found.kind === "tournament") {
    const result = await getCodeTournament(found.organizer, found.id);
    if (!result.ok) return { status: result.code === "not_installed" ? "not_installed" : "failed" };
    return result.value ? { status: "ok", view: { kind: "tournament", tournament: { ...spectatorTournament(result.value), id: watchId } } } : { status: "missing" };
  }

  const { data: tripData, error: tripError } = await db.rpc("get_golf_trip", { p_profile: found.organizer, p_trip: found.id });
  if (tripError) { console.error("get_golf_trip (watch) failed:", tripError.message); return { status: "failed" }; }
  const saved = tripData as SavedGolfTrip | null;
  if (!saved) return { status: "missing" };
  // Photos only where the player shows them publicly (an empty viewer id is nobody's own profile).
  const trip = { ...saved, members: await withMemberPhotos(saved.members, "") };
  // Today's round, else the latest round already played; its saved groups and scores (read only, nothing is created).
  const round = trip.rounds.find((r) => r.playDate === today) ?? [...trip.rounds].reverse().find((r) => r.playDate && r.playDate < today);
  const scoring = round ? await getTripRoundScoring(found.organizer, found.id, round.roundNumber) : null;
  const setup = setupForViewer(await loadSavedTripSetup(trip), false);
  return { status: "ok", view: { kind: "trip", trip: spectatorTrip(trip, scoring === "failed" ? null : scoring, setup, watchId) } };
}
