import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { profileLinksFromBody } from "@/lib/profile/profileEdit";
import { setMyProfileLinks } from "@/lib/profile/profileEditServer";

/**
 * Edit profile → Links: PUT { links: [{ title, url }] } replaces the signed-in golfer's links (up to 5, https only;
 * supabase/profile_edit_v2.sql). Who it is always comes from the session. Website cookie or app Bearer token; private, never cached.
 */
export async function PUT(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  if (current.status !== "ok") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);
  const parsed = profileLinksFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return privateJson({ ok: false, error: parsed.error }, 400);
  const result = await setMyProfileLinks(current.profile.profileId, parsed.links);
  if (result.status === "ok") return privateJson({ ok: true, links: result.links });
  if (result.status === "invalid") return privateJson({ ok: false, error: result.error }, 400);
  if (result.status === "unavailable") return privateJson({ ok: false, error: "Links aren't switched on yet." }, 503);
  return privateJson({ ok: false, error: "Couldn't save your links. Try again." }, 500);
}
