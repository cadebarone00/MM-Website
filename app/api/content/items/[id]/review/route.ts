import { NextResponse } from "next/server";
import { canPublish } from "@/lib/content/ribbon";
import { contentViewer, loadItem, writeItem } from "@/lib/content/ribbonServer";
import { planSave, UUID } from "@/lib/content/ribbonSave";

/** Admins only: approve a waiting post (now or at `publishAt`), or send it back with `note`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (!canPublish(viewer)) return NextResponse.json({ ok: false, error: "Only an Admin can approve posts." }, { status: 403 });
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  try {
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    if (body?.action === "send-back") {
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      if (!note) return NextResponse.json({ ok: false, error: "Write a short note so they know what to change." }, { status: 400 });
      return NextResponse.json({ ok: true, item: await writeItem(item, { status: "changes_requested", publishAt: null, reviewNote: note, approved: false }, viewer.profileId, false) });
    }
    if (body?.action !== "approve") return NextResponse.json({ ok: false, error: "Choose approve or send back." }, { status: 400 });
    const publishAt = typeof body.publishAt === "string" ? body.publishAt : null;
    const plan = planSave(item, publishAt ? "schedule" : "publish", publishAt, viewer, new Date());
    if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error }, { status: plan.status });
    return NextResponse.json({ ok: true, item: await writeItem(item, plan.changes, viewer.profileId, false) });
  } catch (error) {
    console.error("content/items: review failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
