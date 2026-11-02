import { NextResponse } from "next/server";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { canPublish } from "@/lib/content/ribbon";
import { contentViewer, loadItem } from "@/lib/content/ribbonServer";
import { UUID } from "@/lib/content/ribbonSave";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Removes every file in the post's folder. A failure is logged, not shown: the post itself is already gone. */
async function deleteFiles(id: string) {
  try {
    const r2 = createR2Client();
    let token: string | undefined;
    do {
      const page = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: `ribbon/${id}/`, ContinuationToken: token }));
      const keys = (page.Contents ?? []).flatMap((file) => file.Key ? [{ Key: file.Key }] : []);
      if (keys.length) await r2.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys } }));
      token = page.NextContinuationToken;
    } while (token);
  } catch (error) {
    console.error("content/items: couldn't delete files", { id, error });
  }
}

/** Admins delete anything. A Poster deletes only their own post that isn't live or scheduled. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
  try {
    const item = await loadItem(id);
    const mine = viewer.role === "poster" && item?.createdBy === viewer.profileId && item.status !== "published";
    if (!canPublish(viewer) && !mine) return NextResponse.json({ ok: false, error: "You can't delete this post." }, { status: 403 });
    if (!item) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    const { error } = await createSupabaseServiceRoleClient().from("ribbon_content").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await deleteFiles(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("content/items: delete failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't delete that. Try again." }, { status: 500 });
  }
}
