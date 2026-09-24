import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field, submittedAt } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string" || typeof submittedAt !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug, field, or submittedAt." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service
    .from("player_profile_edits")
    .delete()
    .eq("player_slug", playerSlug)
    .eq("field", field)
    .eq("submitted_at", submittedAt);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not deny that edit." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
