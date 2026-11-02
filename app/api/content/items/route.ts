import { NextResponse } from "next/server";
import { contentViewer, loadItem, writeItem } from "@/lib/content/ribbonServer";
import { itemFromBody, itemProblem, mediaProblem, planSave, SAVE_MODES, type SaveMode } from "@/lib/content/ribbonSave";

/** Create or update a post or trip plan. The caller's role comes from the session and decides what the save can do. */
export async function POST(request: Request) {
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in to post." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const item = itemFromBody(body?.item);
  const mode = body?.mode as SaveMode;
  if (!item || !SAVE_MODES.includes(mode)) return NextResponse.json({ ok: false, error: "That post couldn't be read. Try again." }, { status: 400 });
  try {
    const existing = await loadItem(item.id);
    if (existing && existing.kind !== item.kind) return NextResponse.json({ ok: false, error: "That post couldn't be read. Try again." }, { status: 400 });
    // A post stays on the tab it was added to.
    if (existing) item.tab = existing.tab;
    const plan = planSave(existing, mode, typeof body?.publishAt === "string" ? body.publishAt : null, viewer, new Date());
    if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error }, { status: plan.status });
    const problem = itemProblem(item) ?? mediaProblem(item, process.env.R2_PUBLIC_URL ?? "");
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    return NextResponse.json({ ok: true, item: await writeItem(item, plan.changes, viewer.profileId, !existing) });
  } catch (error) {
    console.error("content/items: save failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
