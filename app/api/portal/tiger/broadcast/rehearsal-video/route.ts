import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { pastTournaments } from "@/lib/data";
import { r2PublicUrl } from "@/lib/r2/client";

// Loads an already-uploaded scorecard clip for the rehearsal player-video
// preview. It reads the existing archive/video records only; it never adds a
// clip to the live broadcast queue or changes shared broadcast state.
export async function GET(request: Request) {
  if (!(await requireHost())) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const round = Number(searchParams.get("round"));
  const hole = Number(searchParams.get("hole"));
  const shotNumber = Number(searchParams.get("shotNumber"));
  const playerSlug = searchParams.get("playerSlug");
  const tournament = pastTournaments.find((item) => item.year === year);
  if (!tournament || !playerSlug || !Number.isInteger(round) || !Number.isInteger(hole) || !Number.isInteger(shotNumber)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid scorecard-video details." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id, course, format")
    .eq("tournament_slug", tournament.slug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) console.error("rehearsal-video round lookup failed:", roundError.message);
  if (!roundRow) return NextResponse.json({ ok: false, error: "That scorecard round was not found." }, { status: 404 });

  const [{ data: video, error: videoError }, { data: holeRow, error: holeError }] = await Promise.all([
    service.from("archived_shot_videos").select("storage_path").eq("round_id", roundRow.id).eq("hole", hole).eq("shot_number", shotNumber).maybeSingle(),
    service.from("archived_scorecard_holes").select("par, yards").eq("round_id", roundRow.id).eq("hole", hole).maybeSingle(),
  ]);
  if (videoError) console.error("rehearsal-video clip lookup failed:", videoError.message);
  if (holeError) console.error("rehearsal-video hole lookup failed:", holeError.message);
  if (!video) return NextResponse.json({ ok: false, error: "No uploaded video is linked to that scorecard shot yet." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    video: {
      url: r2PublicUrl(video.storage_path),
      playerName: getPlayerProfileBySlug(playerSlug)?.fullName ?? playerSlug,
      course: roundRow.course,
      format: roundRow.format,
      par: holeRow?.par ?? null,
      yards: holeRow?.yards ?? null,
    },
  });
}
