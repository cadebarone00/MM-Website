import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { declineGolfTripInvitation } from "@/lib/platform/golfTripsServer";

/** The signed-in person says no to an invitation. The organizer sees it as declined; the link stops working.
 *  Website cookie or app Bearer token (Phase 7B, lib/account/selfServiceRequest.ts); private, never cached. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return privateJson({ ok: false, error: "This invitation isn't valid anymore." }, 404);
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  try {
    const result = await declineGolfTripInvitation(token, caller.current);
    if (result === "signed-out") return privateJson({ ok: false, error: "Log in to answer this invitation." }, 401);
    if (result === "no-profile") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);
    if (result === "already_member") return privateJson({ ok: false, error: "You're already in this trip." }, 409);
    if (result === "not_found") return privateJson({ ok: false, error: "This invitation isn't valid anymore." }, 404);
    return privateJson({ ok: true, status: "declined" });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return privateJson({ ok: false, error: "Trip invitations aren't switched on yet." }, 503);
    console.error(error instanceof Error ? error.message : error);
    return privateJson({ ok: false, error: "We couldn't save your answer. Try again." }, 500);
  }
}
