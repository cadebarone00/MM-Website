// app/api/portal/tiger/scorecards/video/sign/route.ts
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";

/**
 * First half of the direct-to-storage upload flow: issues a one-time
 * presigned PUT URL for a shot's video, valid only for the exact storage
 * key this hole/shot resolves to. The browser then uploads the actual file
 * bytes straight to Cloudflare R2 with that URL (bypassing this app's own
 * server functions entirely — no request-body size ceiling on our end, and
 * R2 charges nothing to serve the file back out later). Once the upload
 * succeeds, the browser calls .../video/confirm to link it to the shot;
 * this route never touches the file itself. ContentType is deliberately
 * NOT included in the signed command — that would force the client's PUT
 * to use the exact same Content-Type header or the signature fails, and
 * the client already knows its own file's real MIME type at upload time.
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
  if (roundError) console.error("video/sign: failed to load round", roundError);
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  const { data: holeRow, error: holeError } = await service
    .from("archived_scorecard_holes")
    .select("score")
    .eq("round_id", roundRow.id)
    .eq("hole", hole)
    .maybeSingle();
  if (holeError) console.error("video/sign: failed to load hole", holeError);
  if (!holeRow || shotNumber > holeRow.score) {
    return NextResponse.json({ ok: false, error: "That shot number doesn't exist for this hole's score." }, { status: 400 });
  }

  const storagePath = `${tournamentSlug}/round-${round}/hole-${hole}/shot-${shotNumber}${extension}`;

  try {
    const r2 = createR2Client();
    const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }), { expiresIn: 300 });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("video/sign: failed to create R2 presigned URL", { storagePath, err });
    return NextResponse.json({ ok: false, error: "Could not prepare that upload." }, { status: 500 });
  }
}
