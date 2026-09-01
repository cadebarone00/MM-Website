import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or field." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.rpc("approve_profile_edit", { p_player_slug: playerSlug, p_field: field });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not approve that edit." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
