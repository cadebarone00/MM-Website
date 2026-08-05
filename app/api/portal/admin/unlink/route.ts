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
  // Clears the claim only — does not delete the linked account, and does
  // not touch that account's profiles.player_slug (matches the design
  // spec's "does not log that account out" requirement).
  await service.from("player_slots").update({ claimed_by: null, claimed_at: null }).eq("player_slug", playerSlug);

  return NextResponse.json({ ok: true });
}
