import { privateJson } from "@/lib/account/selfServiceRequest";
import { getGolfTripJoinLink, resetGolfTripJoinLink } from "@/lib/platform/golfTripsServer";

/** Trip Builder: the trip's shareable link (lasts 30 minutes). GET = anyone on the trip; POST = organizer resets it. */
const NOT_ON = "Invite links aren't switched on yet.";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  try {
    const result = await getGolfTripJoinLink(tripId, new URL(request.url).origin);
    if (result.status === "ok") return privateJson(result.link);
    if (result.status === "signed-out") return privateJson({ error: "Log in to see the invite link." }, 401);
    if (result.status === "unavailable") return privateJson({ error: NOT_ON }, 503);
    return privateJson({ error: "Trip not found." }, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return privateJson({ error: "Couldn't get the invite link. Try again." }, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  try {
    const result = await resetGolfTripJoinLink(tripId, new URL(request.url).origin);
    if (result.status === "ok") return privateJson(result.link);
    if (result.status === "signed-out") return privateJson({ error: "Log in to reset the invite link." }, 401);
    if (result.status === "forbidden") return privateJson({ error: "Only the organizer can reset the link." }, 403);
    if (result.status === "unavailable") return privateJson({ error: NOT_ON }, 503);
    return privateJson({ error: "Trip not found." }, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return privateJson({ error: "Couldn't reset the invite link. Try again." }, 500);
  }
}
