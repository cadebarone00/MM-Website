import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";

const VALID_SCENES = ["holding", "individual_leaderboard", "match_play"];

/**
 * Host-only manual scene control (Producer Mode, spec §25) — also how
 * Pause/Resume work (spec §14): pausing is just this same producer-mode
 * override, given whatever scene the auto rotation happened to be showing
 * at the moment Tiger paused it, with `paused: true` set purely so the
 * Broadcast Controls UI can label it "Paused" instead of "Manual."
 * SceneRenderer itself treats paused and manually-picked identically (both
 * are just "show current_scene, no rotation timer"). Always acts on
 * whichever season is currently active — /broadcast never takes a year, so
 * neither does this. Posting a scene switches to producer mode and shows it
 * immediately; omitting `scene` returns to automatic rotation, restarted
 * cleanly from the top (Individual Leaderboard).
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { scene, paused } = await request.json();
  if (scene !== null && scene !== undefined && !VALID_SCENES.includes(scene)) {
    return NextResponse.json({ ok: false, error: "Invalid scene." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const update =
    scene === null || scene === undefined
      ? { automation_mode: "auto", paused: false, scene_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : {
          automation_mode: "producer",
          current_scene: scene,
          paused: paused === true,
          scene_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

  const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, ...update });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the broadcast." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
