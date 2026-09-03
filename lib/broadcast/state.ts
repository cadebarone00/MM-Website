// lib/broadcast/state.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only call
// from a Route Handler or Server Component, same rule as
// lib/data/activeSeasonOverlay.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { DEFAULT_SCENE_DURATIONS_MS, type BroadcastConfig, type BroadcastPayload, type BroadcastScene, type BroadcastState } from "./types";

const VALID_SCENES: BroadcastScene[] = ["holding", "individual_leaderboard", "match_play"];

function isBroadcastScene(value: unknown): value is BroadcastScene {
  return typeof value === "string" && (VALID_SCENES as string[]).includes(value);
}

/**
 * Full broadcast state/config for whichever season is currently marked
 * active (`live_active_season`) — this is what `/broadcast` always shows;
 * it never takes a year from the URL (see the spec's §42 decision). Falls
 * back to sane defaults if that year's rows don't exist yet, the same
 * "unconfigured year is blank/default, not an error" philosophy Master
 * Settings established.
 */
export async function getBroadcastPayload(): Promise<BroadcastPayload> {
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const [{ data: stateRow }, { data: configRow }] = await Promise.all([
    service
      .from("broadcast_state")
      .select("current_scene, scene_started_at, automation_mode, paused, overlay_text, overlay_expires_at")
      .eq("season_year", seasonYear)
      .maybeSingle(),
    service.from("broadcast_config").select("scene_durations_ms").eq("season_year", seasonYear).maybeSingle(),
  ]);

  const state: BroadcastState = {
    seasonYear,
    currentScene: isBroadcastScene(stateRow?.current_scene) ? stateRow.current_scene : "holding",
    sceneStartedAt: stateRow?.scene_started_at ?? new Date().toISOString(),
    automationMode: stateRow?.automation_mode === "producer" ? "producer" : "auto",
    paused: stateRow?.paused ?? false,
    overlayText: stateRow?.overlay_text ?? null,
    overlayExpiresAt: stateRow?.overlay_expires_at ?? null,
  };

  const config: BroadcastConfig = {
    seasonYear,
    sceneDurationsMs: { ...DEFAULT_SCENE_DURATIONS_MS, ...(configRow?.scene_durations_ms ?? {}) },
  };

  return { seasonYear, state, config };
}
