import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { profileEditFromBody, profileSetupFromBody } from "@/lib/profile/profileEdit";
import { updateMyProfile, type ProfileWrite } from "@/lib/profile/profileEditServer";
import { finishProfileSetup } from "@/lib/profile/profileInitialization";

/**
 * POST  = Finish profile setup ({ displayName, username }) for a signed-in, verified login whose profile is missing or
 *         incomplete (Accounts V2: initialize, then set name + username). Calling it again once the profile is
 *         complete just returns that profile's username (nothing is created or overwritten).
 * PATCH = Edit my profile ({ displayName?, username?, bio? }).
 * Who it is always comes from the session; nothing in the body can choose the profile.
 * Website cookie or app Bearer token (Phase 7B, lib/account/selfServiceRequest.ts); private, never cached.
 */
function reply(result: ProfileWrite) {
  if (result.status === "ok") return privateJson({ ok: true, username: result.username, created: result.created });
  if (result.status === "invalid") return privateJson({ ok: false, error: result.error }, 400);
  if (result.status === "unavailable") return privateJson({ ok: false, error: "Profile editing isn't switched on yet." }, 503);
  return privateJson({ ok: false, error: "Couldn't save your profile. Try again." }, 500);
}

async function body(request: Request) {
  try { return await request.json(); } catch { return null; }
}

export async function POST(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  if (current.status === "ok") return privateJson({ ok: true, username: current.profile.username, created: false });
  const parsed = profileSetupFromBody(await body(request));
  if (!parsed.ok) return privateJson({ ok: false, field: parsed.field, error: parsed.error }, 400);
  const result = await finishProfileSetup(current.account.id, parsed.input);
  if (result.status === "unverified") return privateJson({ ok: false, error: "Verify your email first." }, 403);
  if (result.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  // G4: a login that never passed the birthday step (supabase/signup_gate.sql) can't get a profile.
  if (result.status === "age_check_required") return privateJson({ ok: false, code: "age_check_required", error: "This account can't be set up. Start again with your birthday." }, 403);
  return reply(result);
}

export async function PATCH(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status === "signed-out") return privateJson({ ok: false, error: "Log in first." }, 401);
  if (current.status !== "ok") return privateJson({ ok: false, error: "Finish setting up your profile first." }, 409);
  const parsed = profileEditFromBody(await body(request));
  if (!parsed.ok) return privateJson({ ok: false, field: parsed.field, error: parsed.error }, 400);
  return reply(await updateMyProfile(current.profile.profileId, parsed.input));
}
