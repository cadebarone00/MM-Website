// lib/broadcast/state.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only call
// from a Route Handler or Server Component, same rule as
// lib/data/activeSeasonOverlay.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import { placementLabel } from "@/lib/leaderboard/placement";
import { getNextInQueue } from "@/lib/broadcast/queue";
import { getPlayerDisplayName, getPlayerProfileBySlug } from "@/lib/data/players";
import { DEFAULT_SCENE_DURATIONS_MS, type BroadcastConfig, type BroadcastPayload, type BroadcastPlayerVideo, type BroadcastScene, type BroadcastState } from "./types";

const VALID_SCENES: BroadcastScene[] = ["holding", "individual_leaderboard", "match_play"];

function lastName(player: string): string {
  const name = getPlayerDisplayName(player);
  return name.split(/\s+/).at(-1) ?? name;
}

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
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at, audio_track_id, audio_started_at, audio_loop_mode, audio_shuffle, video_phase, active_video_queue_id, video_phase_started_at")
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
    audioShuffle: stateRow?.audio_shuffle ?? false,
    videoPhase: stateRow?.video_phase === "transition" || stateRow?.video_phase === "playing" ? stateRow.video_phase : null,
    activeVideoQueueId: stateRow?.active_video_queue_id ?? null,
    videoPhaseStartedAt: stateRow?.video_phase_started_at ?? null,
  };

  let activeVideo: BroadcastPlayerVideo | null = null;
  if (state.activeVideoQueueId) {
    const { data, error } = await service
      .from("broadcast_player_video_queue")
      .select("id, player_slug, player_name, round, hole, shot_number, par, yards, score_to_par, video_url")
      .eq("id", state.activeVideoQueueId)
      .maybeSingle();
    if (error) console.error("broadcast video queue read failed:", error.message);
    if (data) {
      const profile = getPlayerProfileBySlug(data.player_slug);
      const { standings } = await getBroadcastLeaderboard(seasonYear);
      const placement = standings.findIndex((standing) => {
        const standingProfile = getPlayerProfileBySlug(standing.player);
        return standing.player.toLowerCase() === data.player_slug.toLowerCase() || standingProfile?.id === profile?.id || standing.player.toLowerCase() === profile?.id.toLowerCase();
      });
      const { data: maroonBox } = await service
        .from("live_match_boxes").select("id, maroon_players, white_players, format").eq("season_year", seasonYear).eq("round", data.round).contains("maroon_players", [data.player_slug]).maybeSingle();
      const { data: whiteBox } = maroonBox ? { data: null } : await service
        .from("live_match_boxes").select("id, maroon_players, white_players, format").eq("season_year", seasonYear).eq("round", data.round).contains("white_players", [data.player_slug]).maybeSingle();
      const box = maroonBox ?? whiteBox;
      const team = maroonBox ? "maroon" : whiteBox ? "white" : null;
      const { data: roundState } = await service.from("live_round_state").select("course_id").eq("season_year", seasonYear).eq("round", data.round).maybeSingle();
      const { data: course } = roundState?.course_id
        ? await service.from("live_courses").select("name").eq("id", roundState.course_id).maybeSingle()
        : { data: null };
      let match: BroadcastPlayerVideo["match"] = null;
      if (box && team) {
        const { data: official } = await service.from("live_match_official_state").select("leader, margin").eq("match_box_id", box.id).maybeSingle();
        const ownLeads = official?.leader === team;
        const opponentLeads = official?.leader && official.leader !== "tie" && !ownLeads;
        const margin = official?.margin ?? 0;
        match = {
          team,
          ownPlayers: (team === "maroon" ? box.maroon_players : box.white_players).map(lastName),
          opposingPlayers: (team === "maroon" ? box.white_players : box.maroon_players).map(lastName),
          ownStatus: margin === 0 ? "AS" : ownLeads ? `${margin} UP` : `${margin} DN`,
          opposingStatus: margin === 0 ? "AS" : opponentLeads ? `${margin} UP` : `${margin} DN`,
        };
      }
      activeVideo = {
        id: data.id, playerSlug: data.player_slug, playerName: data.player_name, round: data.round, hole: data.hole,
        shotNumber: data.shot_number, par: data.par, yards: data.yards, scoreToPar: data.score_to_par, individualPlace: placement >= 0 ? placementLabel(standings, placement) : null,
        courseName: course?.name ?? null, format: box?.format ?? null, match, videoUrl: data.video_url,
      };
    }
  }

  const config: BroadcastConfig = {
    seasonYear,
    sceneDurationsMs: { ...DEFAULT_SCENE_DURATIONS_MS, ...(configRow?.scene_durations_ms ?? {}) },
    overlayDurationMs: configRow?.overlay_duration_ms ?? 6000,
    takeoverDurationMs: configRow?.takeover_duration_ms ?? 8000,
  };

  return { seasonYear, state, config, events, activeVideo };
}
