import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Admin invites an old Maroon player by the email on their player slot (Accounts V2).
 * 1. Supabase sends the invite email (it creates the login, or re-sends to an existing unverified one).
 * 2. A player-claim invitation is saved, bound to THAT account id (create_player_claim_invitation).
 * The claim and the profile only happen when that account verifies the email and is initialized
 * (lib/profile/profileInitialization.ts). No profile is made here, a player code proves nothing, and nothing is ever
 * deleted: the V1 version deleted the account id Supabase returned when a later step failed, which could be someone's
 * existing account (docs/auth-local-reproduction-2026-10-16.md S10). A failed step is fixed by sending the invite again.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug } = await request.json();
  if (typeof playerSlug !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: slot } = await service
    .from("player_slots")
    .select("claimed_by, email")
    .eq("player_slug", playerSlug)
    .single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }
  if (slot.claimed_by) {
    return NextResponse.json({ ok: false, error: "Already claimed — unlink first to re-invite." }, { status: 409 });
  }
  if (!slot.email) {
    return NextResponse.json({ ok: false, error: "Add an email for this player first." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(slot.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (inviteError || !invited.user) {
    const existing = /already been registered|already registered|email_exists/i.test(`${inviteError?.code ?? ""} ${inviteError?.message ?? ""}`);
    return NextResponse.json({ ok: false, error: existing
      ? "That email already has a verified account. Linking an existing account to a player needs the player-claim review (not built yet)."
      : inviteError?.message ?? "Could not send that invite." }, { status: existing ? 409 : 400 });
  }

  const { error: claimError } = await service.rpc("create_player_claim_invitation", {
    p_host: host.userId, p_player_slug: playerSlug, p_account: invited.user.id,
  });
  if (claimError) {
    console.error("create_player_claim_invitation failed:", claimError.message);
    return NextResponse.json({ ok: false, error: claimError.code === "22023"
      ? claimError.message
      : "The invite email was sent, but the player link wasn't saved. Send the invite again." }, { status: claimError.code === "22023" ? 409 : 500 });
  }

  return NextResponse.json({ ok: true });
}
