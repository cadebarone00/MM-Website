import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// The Tiger-only override for a player's *visible* name — never touches
// player_slots.player_slug, which stays the permanent identifier every
// join/URL uses. Mirrors player-email's shape exactly.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, fullName } = await request.json();
  if (typeof playerSlug !== "string" || typeof fullName !== "string" || !fullName.trim()) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or name." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const trimmedName = fullName.trim();

  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error } = await service.from("player_slots").update({ full_name: trimmedName }).eq("player_slug", playerSlug);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that name." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fullName: trimmedName });
}
