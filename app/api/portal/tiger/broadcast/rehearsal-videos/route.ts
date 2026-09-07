import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { pastTournaments } from "@/lib/data";
import { r2PublicUrl } from "@/lib/r2/client";

// A private Tiger-only index of real scorecard clips that can be used in a
// rehearsal. Reading this list never puts anything on air or in the queue.
export async function GET(request: Request) {
  if (!(await requireHost())) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year"));
  const tournament = pastTournaments.find((item) => item.year === year);
  if (!tournament) return NextResponse.json({ ok: false, error: "No archived tournament exists for that year." }, { status: 404 });

  const service = createSupabaseServiceRoleClient();
  const { data: rounds, error: roundsError } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournament.slug);
  if (roundsError) console.error("rehearsal-videos rounds lookup failed:", roundsError.message);
  const roundRows = rounds ?? [];
  if (roundRows.length === 0) return NextResponse.json({ ok: true, clips: [] });

  const roundIds = roundRows.map((row) => row.id);
  const [{ data: videos, error: videosError }, { data: holes, error: holesError }] = await Promise.all([
    service.from("archived_shot_videos").select("round_id, hole, shot_number, storage_path").in("round_id", roundIds),
    service.from("archived_scorecard_holes").select("round_id, hole, par, yards").in("round_id", roundIds),
  ]);
  if (videosError) console.error("rehearsal-videos clip lookup failed:", videosError.message);
  if (holesError) console.error("rehearsal-videos hole lookup failed:", holesError.message);

  const roundById = new Map(roundRows.map((row) => [row.id, row]));
  const holeByRoundAndNumber = new Map((holes ?? []).map((hole) => [`${hole.round_id}:${hole.hole}`, hole]));
  const clips = (videos ?? []).flatMap((video) => {
    const round = roundById.get(video.round_id);
    if (!round) return [];
    const hole = holeByRoundAndNumber.get(`${video.round_id}:${video.hole}`);
    return [{
      playerSlug: round.player_slug,
      playerName: getPlayerProfileBySlug(round.player_slug)?.fullName ?? round.player_slug,
      round: round.round,
      hole: video.hole,
      shotNumber: video.shot_number,
      course: round.course,
      format: round.format,
      par: hole?.par ?? null,
      yards: hole?.yards ?? null,
      url: r2PublicUrl(video.storage_path),
    }];
  }).sort((a, b) => a.playerName.localeCompare(b.playerName) || a.round - b.round || a.hole - b.hole || a.shotNumber - b.shotNumber);

  return NextResponse.json({ ok: true, clips });
}
