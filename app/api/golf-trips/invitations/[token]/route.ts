import { NextResponse } from "next/server";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { acceptGolfTripInvitation, getGolfTripInvitation } from "@/lib/platform/golfTripsServer";
import { enforcementEnabled } from "@/lib/account/accessPolicy";
import { getAccountLifecycleForRequest } from "@/lib/profile/currentProfile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const notFound = () => NextResponse.json({ ok: false, error: "This invitation isn't valid anymore." }, { status: 404 });

/** Enforcement on: Pending accounts hold the invitation instead of joining. Null = not Pending, accept as normal. */
async function holdForPendingAccount(request: Request, token: string): Promise<NextResponse | null> {
  let lifecycle;
  try {
    lifecycle = await getAccountLifecycleForRequest(request);
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't check your account. Try again." }, { status: 503 });
  }
  if (lifecycle.state === "unavailable") return NextResponse.json({ ok: false, error: "We couldn't check your account. Try again." }, { status: 503 });
  if (lifecycle.state !== "pending") return null;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("hold_golf_trip_invitation", { p_account: lifecycle.account.id, p_token: token });
  if (error) {
    console.error("hold_golf_trip_invitation failed:", error.code ?? "unknown");
    return NextResponse.json({ ok: false, error: "We couldn't save this invitation. Try again." }, { status: 500 });
  }
  if ((data as { status?: string } | null)?.status !== "held") return notFound();
  return NextResponse.json({ ok: true, status: "held", tripId: (data as { tripId?: string }).tripId ?? null,
    message: "Finish setting up your account and you'll join this trip." });
}

/** GET: what this invite link shows (trip, invited name, status) — never the invited email. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  const invitation = await getGolfTripInvitation(token);
  return invitation ? NextResponse.json({ ok: true, invitation }) : notFound();
}

/**
 * POST: the signed-in golfer accepts — their profile is attached to the invited member row. Safe to repeat.
 * With account enforcement on (Pending accounts Phase 5) a PENDING account's accept only HOLDS the invitation
 * (hold_golf_trip_invitation: no membership); Finish accepts it once the account is Active. Ineligible, restricted and
 * closed accounts never get here (middleware.ts / lib/account/accessPolicy.ts "invite").
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  if (enforcementEnabled()) {
    const held = await holdForPendingAccount(request, token);
    if (held) return held;
  }
  try {
    const result = await acceptGolfTripInvitation(token);
    if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in or sign up to accept this invitation." }, { status: 401 });
    if (result.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result.status === "claimed") return NextResponse.json({ ok: false, error: "Someone else already accepted this invitation." }, { status: 409 });
    if (result.status !== "accepted" && result.status !== "already_member") return notFound();
    return NextResponse.json({ ok: true, status: result.status, tripId: result.tripId, url: golfTripUrl(result.tripId) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Trip invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't accept this invitation. Try again." }, { status: 500 });
  }
}
