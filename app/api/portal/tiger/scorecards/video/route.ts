// app/api/portal/tiger/scorecards/video/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const form = await request.formData();
  const tournamentSlug = form.get("tournamentSlug");
  const playerSlug = form.get("playerSlug");
  const round = Number(form.get("round"));
  const hole = Number(form.get("hole"));
  const shotNumber = Number(form.get("shotNumber"));
  const file = form.get("file");

  if (
    typeof tournamentSlug !== "string" ||
    typeof playerSlug !== "string" ||
    !Number.isInteger(round) ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    !Number.isInteger(shotNumber) ||
    shotNumber < 1 ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  const { data: holeRow } = await service.from("archived_scorecard_holes").select("score").eq("round_id", roundRow.id).eq("hole", hole).maybeSingle();
  if (!holeRow || shotNumber > holeRow.score) {
    return NextResponse.json({ ok: false, error: "That shot number doesn't exist for this hole's score." }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".mp4";
  const storagePath = `${tournamentSlug}/round-${round}/hole-${hole}/shot-${shotNumber}${extension}`;

  const { error: uploadError } = await service.storage.from("shot-videos").upload(storagePath, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Could not upload that video." }, { status: 500 });
  }

  const { error: dbError } = await service
    .from("archived_shot_videos")
    .upsert(
      { round_id: roundRow.id, hole, shot_number: shotNumber, storage_path: storagePath, uploaded_at: new Date().toISOString() },
      { onConflict: "round_id,hole,shot_number" }
    );
  if (dbError) {
    return NextResponse.json({ ok: false, error: "Video uploaded, but could not be linked to this shot." }, { status: 500 });
  }

  const { data: publicUrl } = service.storage.from("shot-videos").getPublicUrl(storagePath);
  return NextResponse.json({ ok: true, url: publicUrl.publicUrl });
}
