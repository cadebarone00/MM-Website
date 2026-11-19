import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { profileSocialsFromBody } from "@/lib/profile/profileSocials";
import { setMyProfileLinks } from "@/lib/profile/profileEditServer";

/**
 * Edit profile → Socials: PUT { links: [{ platform, url }] } replaces the signed-in golfer's socials (up to 4, one per app;
 * supabase/profile_socials.sql). Who it is always comes from the session. Website cookie or app Bearer token; private, never cached.
 */
export async function PUT(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  if (current.status !== "ok") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);
  const parsed = profileSocialsFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return privateJson({ ok: false, error: parsed.error }, 400);
  const result = await setMyProfileLinks(current.profile.profileId, parsed.socials);
  if (result.status === "ok") return privateJson({ ok: true, links: result.links });
  if (result.status === "invalid") return privateJson({ ok: false, error: result.error }, 400);
  if (result.status === "unavailable") return privateJson({ ok: false, error: "Socials aren't switched on yet." }, 503);
  return privateJson({ ok: false, error: "Couldn't save your socials. Try again." }, 500);
}
