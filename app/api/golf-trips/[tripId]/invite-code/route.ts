import { createSupabaseServerClient } from "@/lib/supabase/server";
import { golfTripInviteCode, resetGolfTripInviteCode } from "@/lib/platform/joinCodesServer";
import { reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET: the trip's invite code (anyone on the trip, to share). POST: the organizer makes a new one (the old one stops working). */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await golfTripInviteCode(user.id, (await params).tripId), (code) => ({ code }));
}

export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await resetGolfTripInviteCode(user.id, (await params).tripId), (code) => ({ code }));
}
