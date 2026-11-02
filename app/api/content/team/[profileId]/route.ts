import { NextResponse } from "next/server";
import { canPublish } from "@/lib/content/ribbon";
import { contentViewer } from "@/lib/content/ribbonServer";
import { UUID } from "@/lib/content/ribbonSave";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Admins only. Cancels an invite, or removes a Poster: access ends at once, and their posts and counts stay. */
export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (!canPublish(viewer)) return NextResponse.json({ ok: false, error: "Only an Admin can do that." }, { status: 403 });
  if (!UUID.test(profileId)) return NextResponse.json({ ok: false, error: "Person not found." }, { status: 404 });
  const service = createSupabaseServiceRoleClient();
  const { error: cancelError } = await service.from("content_team").delete().eq("profile_id", profileId).eq("status", "invited");
  const { error } = await service.from("content_team").update({ status: "removed", removed_by: viewer.profileId, removed_at: new Date().toISOString() }).eq("profile_id", profileId).eq("status", "active");
  if (cancelError || error) {
    console.error("content/team: remove failed", cancelError ?? error);
    return NextResponse.json({ ok: false, error: "Couldn't do that. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
