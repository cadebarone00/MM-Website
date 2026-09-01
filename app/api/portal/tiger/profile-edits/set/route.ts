import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isEditableField } from "@/lib/data/players/overrides";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field, value } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string" || !isEditableField(field)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid playerSlug/field." }, { status: 400 });
  }
  if (typeof value !== "string" && !Array.isArray(value)) {
    return NextResponse.json({ ok: false, error: "Invalid value." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error: upsertError } = await service
    .from("player_profile_overrides")
    .upsert({ player_slug: playerSlug, field, value, updated_at: new Date().toISOString() }, { onConflict: "player_slug,field" });
  if (upsertError) {
    return NextResponse.json({ ok: false, error: "Could not save that change." }, { status: 500 });
  }

  await service.from("player_profile_edits").delete().eq("player_slug", playerSlug).eq("field", field);

  return NextResponse.json({ ok: true });
}
