import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function requireHost() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  return profile?.is_host ? user : null;
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { playerSlug, username } = await request.json();
  if (!playerSlug || !username) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or username." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: slot } = await service.from("player_slots").select("claimed_by").eq("player_slug", playerSlug).single();

  if (slot?.claimed_by) {
    return NextResponse.json({ ok: false, error: "That player's username is locked — unlink first to change it." }, { status: 400 });
  }

  // Re-guard against claimed_by in the update itself (not just the check
  // above) — closes the TOCTOU window where the slot gets claimed between
  // the select and the update, which would otherwise silently overwrite
  // the username on a now-claimed player.
  const { data: updated, error } = await service
    .from("player_slots")
    .update({ username })
    .eq("player_slug", playerSlug)
    .is("claimed_by", null)
    .select();

  if (error) {
    return NextResponse.json({ ok: false, error: "That username is already in use." }, { status: 400 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ ok: false, error: "That player was just claimed — refresh and try again." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
