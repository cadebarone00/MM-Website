import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { tripJoinValue } from "@/lib/platform/golfTripJoinLinks";
import { getGolfTripJoinPreview, joinGolfTripByCode } from "@/lib/platform/golfTripsServer";

/** The join link's preview (trip name and status), the same one the website's join page shows. Private, never cached. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = tripJoinValue((await params).code);
  if (!code) return privateJson({ ok: true, preview: null });
  return privateJson({ ok: true, preview: await getGolfTripJoinPreview(code) });
}

/** Trip Builder: the signed-in person joins a trip through its shareable link or its 6-character invite code. Private, never cached. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = tripJoinValue((await params).code);
  if (!code) return privateJson({ status: "not_found" }, 400);
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  try {
    const result = await joinGolfTripByCode(code, caller.current);
    if (result.status === "signed-out") return privateJson({ error: "Log in to join this trip." }, 401);
    if (result.status === "no-profile") return privateJson({ error: "Finish setting up your profile first." }, 409);
    return privateJson(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return privateJson({ error: "We couldn't add you to the trip. Try again." }, 500);
  }
}
