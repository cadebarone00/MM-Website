// app/api/portal/tiger/scorecards/video/sign/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * First half of the direct-to-storage upload flow: issues a one-time signed
 * upload URL/token for a shot's video, valid only for the exact storage path
 * this hole/shot resolves to. The browser then uploads the actual file bytes
 * straight to Supabase Storage with that token (bypassing this app's own
 * server functions entirely, so there's no request-body size ceiling on our
 * end) — see components/portal/tiger/ScorecardEditor.tsx's save(). Once the
 * upload succeeds, the browser calls .../video/confirm to link it to the
 * shot; this route never touches the file itself.
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

  const storagePath = `${tournamentSlug}/round-${round}/hole-${hole}/shot-${shotNumber}${extension}`;
  const { data: signed, error: signError } = await service.storage.from("shot-videos").createSignedUploadUrl(storagePath, { upsert: true });
  if (signError || !signed) {
    console.error("video/sign: failed to create signed upload URL", { storagePath, signError });
    return NextResponse.json({ ok: false, error: "Could not prepare that upload." }, { status: 500 });
  }
  console.log("video/sign: issued signed upload URL", { storagePath, returnedPath: signed.path });

  return NextResponse.json({ ok: true, path: signed.path, token: signed.token });
}
