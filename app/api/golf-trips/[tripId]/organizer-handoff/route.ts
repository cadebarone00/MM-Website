import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { answerTripOffer, cancelTripOffer, offerTripToMember } from "@/lib/account/accountDeletion";

/**
 * Organizer hand-off (supabase/account_deletion.sql). Nobody becomes organizer without accepting.
 * POST   { memberId }        organizer asks a joined member (their member row on THIS trip) to take over
 * PATCH  { accept: boolean } the asked member accepts or declines
 * DELETE                     organizer withdraws the request
 * Who is acting always comes from the session; the database checks the roles.
 */
type Params = { params: Promise<{ tripId: string }> };

async function golfer(params: Params["params"]) {
  const { tripId } = await params;
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { error: NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 }) };
  if (current.status !== "ok") return { error: NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 }) };
  if (!isGolfTripId(tripId)) return { error: NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 }) };
  return { tripId, profileId: current.profile.profileId };
}

function reply(result: Awaited<ReturnType<typeof offerTripToMember>>) {
  if (result.status === "ok") return NextResponse.json({ ok: true });
  if (result.status === "invalid") return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  if (result.status === "forbidden") return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
}

export async function POST(request: Request, { params }: Params) {
  const who = await golfer(params);
  if ("error" in who) return who.error;
  const body = await request.json().catch(() => null) as { memberId?: unknown } | null;
  if (typeof body?.memberId !== "string" || !isGolfTripId(body.memberId)) return NextResponse.json({ ok: false, error: "Pick a member." }, { status: 400 });
  return reply(await offerTripToMember(who.profileId, who.tripId, body.memberId));
}

export async function PATCH(request: Request, { params }: Params) {
  const who = await golfer(params);
  if ("error" in who) return who.error;
  const body = await request.json().catch(() => null) as { accept?: unknown } | null;
  if (typeof body?.accept !== "boolean") return NextResponse.json({ ok: false, error: "Accept or decline." }, { status: 400 });
  return reply(await answerTripOffer(who.profileId, who.tripId, body.accept));
}

export async function DELETE(_request: Request, { params }: Params) {
  const who = await golfer(params);
  if ("error" in who) return who.error;
  return reply(await cancelTripOffer(who.profileId, who.tripId));
}
