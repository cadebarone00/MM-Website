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

  const { playerSlug } = await request.json();
  if (!playerSlug) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Unlink is a true undo: it also demotes the previously-linked account
  // back to an ordinary account (they stay logged in, they just lose
  // player/Portal access on their next session check). It must not delete
  // the account or touch anything besides player_slug.
  const { data: slot } = await service
    .from("player_slots")
    .select("claimed_by")
    .eq("player_slug", playerSlug)
    .single();

  if (slot?.claimed_by) {
    await service.from("profiles").update({ player_slug: null }).eq("id", slot.claimed_by);
  }

  await service.from("player_slots").update({ claimed_by: null, claimed_at: null }).eq("player_slug", playerSlug);

  return NextResponse.json({ ok: true });
}
