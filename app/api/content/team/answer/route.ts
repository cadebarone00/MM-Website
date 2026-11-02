import { NextResponse } from "next/server";
import { contentViewer } from "@/lib/content/ribbonServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** The invited person answers their own invite. Accept makes them a Poster; decline removes the invite. */
export async function POST(request: Request) {
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (viewer.role !== "invited") return NextResponse.json({ ok: false, error: "That invite is no longer open." }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (typeof body?.accept !== "boolean") return NextResponse.json({ ok: false, error: "Choose accept or decline." }, { status: 400 });
  const rows = createSupabaseServiceRoleClient().from("content_team");
  const { error } = body.accept
    ? await rows.update({ status: "active", accepted_at: new Date().toISOString() }).eq("profile_id", viewer.profileId).eq("status", "invited")
    : await rows.delete().eq("profile_id", viewer.profileId).eq("status", "invited");
  if (error) {
    console.error("content/team/answer: failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
