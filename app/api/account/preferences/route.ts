import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { preferenceChangeFromBody } from "@/lib/profile/preferences";
import { saveMyPreference } from "@/lib/profile/preferencesServer";

/**
 * Settings → Notifications / Golf preferences: PUT one change ({ notification, channel, on } | { distance } |
 * { usualTees } | { scoreEntry }) for the signed-in golfer (supabase/profile_preferences.sql). Who it is always comes from
 * the session. Website cookie or app Bearer token; private, never cached.
 */
export async function PUT(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  if (current.status !== "ok") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);
  const parsed = preferenceChangeFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return privateJson({ ok: false, error: parsed.error }, 400);
  const result = await saveMyPreference(current.profile.profileId, parsed.change);
  if (result.status === "ok") return privateJson({ ok: true, preferences: result.preferences });
  if (result.status === "invalid") return privateJson({ ok: false, error: result.error }, 400);
  if (result.status === "unavailable") return privateJson({ ok: false, error: "These settings aren't switched on yet." }, 503);
  return privateJson({ ok: false, error: "Couldn't save that. Try again." }, 500);
}
