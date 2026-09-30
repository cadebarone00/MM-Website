import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isEditableField } from "@/lib/data/players/overrides";

const MAX_VALUE_LENGTH = 5000;

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field, value } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string" || !isEditableField(field)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid playerSlug/field." }, { status: 400 });
  }
  if (field === "history" ? !Array.isArray(value) : typeof value !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid value." }, { status: 400 });
  }
  const tooLong = Array.isArray(value) ? value.some((v) => typeof v !== "string" || v.length > MAX_VALUE_LENGTH) : value.length > MAX_VALUE_LENGTH;
  if (tooLong) {
    return NextResponse.json({ ok: false, error: "That value is too long." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Validate the slug against the real roster of player slots — never trust
  // a client-supplied slug to actually exist before writing it as a foreign key.
  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error: upsertError } = await service
    .from("player_profile_overrides")
    .upsert({ player_slug: playerSlug, field, value, updated_at: new Date().toISOString() }, { onConflict: "player_slug,field" });
  if (upsertError) {
    return NextResponse.json({ ok: false, error: "Could not save that change." }, { status: 500 });
  }

  await service.from("player_profile_edits").delete().eq("player_slug", playerSlug).eq("field", field);

  return NextResponse.json({ ok: true });
}
