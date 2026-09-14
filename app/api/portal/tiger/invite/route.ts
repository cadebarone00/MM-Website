import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerDisplayName } from "@/lib/data/players";

// Sends a real invite email through Supabase — this is the one place in the
// app that creates a player's login before they ever visit /signup. It
// mirrors /api/auth/signup's create-then-rollback shape: create the auth
// user, insert their profile, claim the slot; unwind on any failure so a
// half-finished invite never leaves an orphaned auth user or a wrongly
// claimed slot.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, email } = await request.json();
  if (typeof playerSlug !== "string" || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or email." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: slot } = await service
    .from("player_slots")
    .select("username, claimed_by")
    .eq("player_slug", playerSlug)
    .single();
  if (!slot || !slot.username) {
    return NextResponse.json({ ok: false, error: "Unknown player or no username assigned yet." }, { status: 400 });
  }
  if (slot.claimed_by) {
    return NextResponse.json({ ok: false, error: "Already claimed — unlink first to re-invite." }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (inviteError || !invited.user) {
    return NextResponse.json({ ok: false, error: inviteError?.message ?? "Could not send that invite." }, { status: 400 });
  }

  const { error: profileError } = await service.from("profiles").insert({
    id: invited.user.id,
    email,
    display_name: getPlayerDisplayName(playerSlug),
    username: slot.username,
    is_host: false,
    player_slug: playerSlug,
  });
  if (profileError) {
    const { error: deleteError } = await service.auth.admin.deleteUser(invited.user.id);
    if (deleteError) {
      console.error("Failed to clean up orphaned auth user after profile insert failure:", deleteError);
    }
    return NextResponse.json({ ok: false, error: "Could not send that invite — try again." }, { status: 400 });
  }

  const { data: claimed } = await service
    .from("player_slots")
    .update({ claimed_by: invited.user.id, claimed_at: new Date().toISOString(), email })
    .eq("player_slug", playerSlug)
    .is("claimed_by", null)
    .select();

  if (!claimed || claimed.length === 0) {
    // Someone else claimed this slot (e.g. the player self-signed-up with
    // their code) in the split second between our check above and this
    // update. Roll back cleanly rather than leave a duplicate invited account.
    const { error: deleteError } = await service.auth.admin.deleteUser(invited.user.id);
    if (deleteError) {
      console.error("Failed to clean up auth user after losing an invite/claim race:", deleteError);
    }
    return NextResponse.json({ ok: false, error: "That player was just claimed — refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
