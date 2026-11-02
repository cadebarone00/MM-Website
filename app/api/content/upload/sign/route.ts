import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { canEdit, canPost } from "@/lib/content/ribbon";
import { contentViewer, loadItem } from "@/lib/content/ribbonServer";
import { UPLOAD_TYPES, uploadProblem, UUID } from "@/lib/content/ribbonSave";
import { createR2Client, R2_BUCKET, r2PublicUrl } from "@/lib/r2/client";

/**
 * Gives the content team a short-lived address to send one photo or video straight to R2 (same direct-to-storage flow as
 * the broadcast playlist), under ribbon/<post id>/. The file never passes through this server.
 */
export async function POST(request: Request) {
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (!canPost(viewer)) return NextResponse.json({ ok: false, error: "Only the content team can upload." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const problem = uploadProblem(body?.contentType, body?.size);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  if (typeof body?.itemId !== "string" || !UUID.test(body.itemId)) return NextResponse.json({ ok: false, error: "That post couldn't be read. Try again." }, { status: 400 });
  const itemId = body.itemId.toLowerCase();
  const contentType = body.contentType.toLowerCase();
  try {
    const existing = await loadItem(itemId);
    if (existing && !canEdit(existing, viewer)) return NextResponse.json({ ok: false, error: "You can't edit this post." }, { status: 403 });
    const key = `ribbon/${itemId}/${randomUUID()}${UPLOAD_TYPES[contentType].extension}`;
    const url = await getSignedUrl(createR2Client(), new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType, ContentLength: body.size }), { expiresIn: 600 });
    return NextResponse.json({ ok: true, url, publicUrl: r2PublicUrl(key) });
  } catch (error) {
    console.error("content/upload/sign: failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't prepare that upload. Try again." }, { status: 500 });
  }
}
