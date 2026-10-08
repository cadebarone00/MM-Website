import { NextResponse } from "next/server";
import { removeGolfTripMember } from "@/lib/platform/golfTripsServer";

/** Organizer removes a member, or cancels an invitation (its link stops working). The organizer can't be removed. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; memberId: string }> }) {
  const { tripId, memberId } = await params;
  try {
    const removed = await removeGolfTripMember(tripId, memberId);
    if (removed === "signed-out") return NextResponse.json({ ok: false, error: "Log in to manage this trip." }, { status: 401 });
    if (!removed) return NextResponse.json({ ok: false, error: "That member couldn't be found, or you're not the organizer." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't remove them. Try again." }, { status: 500 });
  }
}
