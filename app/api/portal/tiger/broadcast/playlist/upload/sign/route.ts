// app/api/portal/tiger/broadcast/playlist/upload/sign/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireHost } from "@/lib/portal/requireHost";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";

const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg"];

/**
 * First half of the direct-to-storage upload flow for playlist tracks —
 * same two-step pattern as .../scorecards/video/sign, different bucket
 * prefix (playlist/{year}/{uuid}{ext}) so audio and shot video never
 * collide. Always acts on whichever year Broadcast Controls has picked,
 * same as every other broadcast_* host route.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { extension } = await request.json();
  if (typeof extension !== "string" || !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Unsupported audio file type." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const storagePath = `playlist/${seasonYear}/${randomUUID()}${extension.toLowerCase()}`;

  try {
    const r2 = createR2Client();
    const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }), { expiresIn: 300 });
    return NextResponse.json({ ok: true, url, storagePath });
  } catch (err) {
    console.error("playlist/upload/sign: failed to create R2 presigned URL", { storagePath, err });
    return NextResponse.json({ ok: false, error: "Could not prepare that upload." }, { status: 500 });
  }
}
