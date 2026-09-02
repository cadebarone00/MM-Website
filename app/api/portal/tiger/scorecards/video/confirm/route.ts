// app/api/portal/tiger/scorecards/video/confirm/route.ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { r2PublicUrl } from "@/lib/r2/client";

/**
 * Second half of the direct-to-storage upload flow: called once the browser
 * has already uploaded the file straight to Cloudflare R2 using the
 * presigned URL from .../video/sign. This route touches no file bytes and
 * makes no storage-service call at all — it only links the already-
 * uploaded object to its shot and revalidates the public pages that show
 * it.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { tournamentSlug, playerSlug, round, hole, shotNumber, extension } = await request.json();
  if (
    typeof tournamentSlug !== "string" ||
    typeof playerSlug !== "string" ||
    !Number.isInteger(round) ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    !Number.isInteger(shotNumber) ||
    shotNumber < 1 ||
    typeof extension !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) console.error("video/confirm: failed to load round", roundError);
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  const { data: holeRow, error: holeError } = await service
    .from("archived_scorecard_holes")
    .select("score")
    .eq("round_id", roundRow.id)
    .eq("hole", hole)
    .maybeSingle();
  if (holeError) console.error("video/confirm: failed to load hole", holeError);
  if (!holeRow || shotNumber > holeRow.score) {
    return NextResponse.json({ ok: false, error: "That shot number doesn't exist for this hole's score." }, { status: 400 });
  }

  // Recomputed the same way .../video/sign computed it — never trust a
  // client-supplied storage path, derive it fresh from the validated
  // identifying fields so this can only ever confirm the exact object this
  // hole/shot's signed URL was actually issued for.
  const storagePath = `${tournamentSlug}/round-${round}/hole-${hole}/shot-${shotNumber}${extension}`;

  const { error: dbError } = await service
    .from("archived_shot_videos")
    .upsert(
      { round_id: roundRow.id, hole, shot_number: shotNumber, storage_path: storagePath, uploaded_at: new Date().toISOString() },
      { onConflict: "round_id,hole,shot_number" }
    );
  if (dbError) {
    console.error("video/confirm: failed to link video to shot", dbError);
    return NextResponse.json({ ok: false, error: "Video uploaded, but could not be linked to this shot." }, { status: 500 });
  }

  const profile = getPlayerProfileBySlug(playerSlug);
  const playerParam = profile?.id.toLowerCase();
  if (playerParam) {
    revalidatePath(`/leaderboard/${tournamentSlug}/players/${playerParam}`);
    revalidatePath(`/leaderboard/${tournamentSlug}`);
  }

  return NextResponse.json({ ok: true, url: r2PublicUrl(storagePath) });
}
