import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// The one place a player's email gets set on Players & Teams — Send Invite
// (app/api/portal/tiger/invite) always reads it from here rather than
// taking an address of its own, so there's a single email on file per
// player instead of one typed fresh on every invite.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, email } = await request.json();
  if (typeof playerSlug !== "string" || typeof email !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or email." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const trimmedEmail = email.trim() || null;

  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error } = await service.from("player_slots").update({ email: trimmedEmail }).eq("player_slug", playerSlug);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: trimmedEmail });
}
