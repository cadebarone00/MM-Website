// lib/broadcast/state.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only call
// from a Route Handler or Server Component, same rule as
// lib/data/activeSeasonOverlay.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { getNextInQueue } from "@/lib/broadcast/queue";
import { DEFAULT_SCENE_DURATIONS_MS, type BroadcastConfig, type BroadcastPayload, type BroadcastScene, type BroadcastState } from "./types";

const VALID_SCENES: BroadcastScene[] = ["holding", "individual_leaderboard", "match_play"];

function isBroadcastScene(value: unknown): value is BroadcastScene {
  return typeof value === "string" && (VALID_SCENES as string[]).includes(value);
}

/**
 * Full broadcast state/config for whichever year Broadcast Controls has
 * picked (`broadcast_display_year`) — this is what `/broadcast` always
 * shows; it never takes a year from the URL (see the spec's §42 decision).
 * Deliberately independent of `live_active_season` — that flag governs the
 * real scoring system, this is just "what /broadcast is currently looking
 * at." Falls back to sane defaults if that year's rows don't exist yet, the
 * same "unconfigured year is blank/default, not an error" philosophy
 * Master Settings established.
 */
export async function getBroadcastPayload(): Promise<BroadcastPayload> {
  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const [{ data: stateRow, error: stateError }, { data: configRow, error: configError }, events] = await Promise.all([
    service
      .from("broadcast_state")
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at, audio_track_id, audio_started_at, audio_loop_mode")
      .eq("season_year", seasonYear)
      .maybeSingle(),
    service.from("broadcast_config").select("scene_durations_ms, overlay_duration_ms, takeover_duration_ms").eq("season_year", seasonYear).maybeSingle(),
    getNextInQueue(seasonYear),
  ]);

  // A missing row for this season is expected (falls back to defaults
  // below, same as Master Settings' "unconfigured year" philosophy) — but
  // an actual query error (e.g. a schema mismatch) is not, and silently
  // falling back to defaults on one hid exactly that kind of bug for
  // several steps before a write finally surfaced it. Log, don't throw:
  // broadcast failures must never take down the page (spec §32).
  if (stateError) console.error("broadcast_state read failed, falling back to defaults:", stateError.message);
  if (configError) console.error("broadcast_config read failed, falling back to defaults:", configError.message);

  const state: BroadcastState = {
    seasonYear,
    currentScene: isBroadcastScene(stateRow?.current_scene) ? stateRow.current_scene : "holding",
    sceneStartedAt: stateRow?.scene_started_at ?? new Date().toISOString(),
    automationMode: stateRow?.automation_mode === "producer" ? "producer" : "auto",
    paused: stateRow?.paused ?? false,
    tournamentLive: stateRow?.tournament_live ?? false,
    overlayText: stateRow?.overlay_text ?? null,
    overlayExpiresAt: stateRow?.overlay_expires_at ?? null,
    audioTrackId: stateRow?.audio_track_id ?? null,
    audioStartedAt: stateRow?.audio_started_at ?? null,
    audioLoopMode: stateRow?.audio_loop_mode === "one" ? "one" : "all",
  };

  const config: BroadcastConfig = {
    seasonYear,
    sceneDurationsMs: { ...DEFAULT_SCENE_DURATIONS_MS, ...(configRow?.scene_durations_ms ?? {}) },
    overlayDurationMs: configRow?.overlay_duration_ms ?? 6000,
    takeoverDurationMs: configRow?.takeover_duration_ms ?? 8000,
  };

  return { seasonYear, state, config, events };
}
