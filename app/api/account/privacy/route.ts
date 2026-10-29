import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { roundsVisibilityFromBody } from "@/lib/platform/playerRoundsPrivacy";
import { setMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";

/** Settings → Privacy: PUT { visibility: "public" | "private" } for the signed-in golfer's profile (its Rounds).
 *  Website cookie or app Bearer token (Phase 7B, lib/account/selfServiceRequest.ts); private, never cached. */
export async function PUT(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in to change your privacy." }, 401);
  if (current.status !== "ok") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);

  const visibility = roundsVisibilityFromBody(await request.json().catch(() => null));
  if (!visibility) return privateJson({ ok: false, error: "Choose Public or Private." }, 400);

  const result = await setMyRoundsVisibility(current.profile.profileId, visibility);
  if (result === "not-installed") return privateJson({ ok: false, error: "Privacy settings aren't switched on yet." }, 503);
  if (result === "failed") return privateJson({ ok: false, error: "We couldn't save that. Try again." }, 500);
  return privateJson({ ok: true, visibility });
}
