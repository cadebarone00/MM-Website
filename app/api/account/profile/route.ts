import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { profileEditFromBody, profileSetupFromBody } from "@/lib/profile/profileEdit";
import { updateMyProfile, type ProfileWrite } from "@/lib/profile/profileEditServer";
import { finishProfileSetup } from "@/lib/profile/profileInitialization";

/**
 * POST  = Finish profile setup ({ displayName, username }) for a signed-in, verified login whose profile is missing or
 *         incomplete (Accounts V2: initialize, then set name + username). Calling it again once the profile is
 *         complete just returns that profile's username (nothing is created or overwritten).
 * PATCH = Edit my profile ({ displayName?, username?, bio? }).
 * Who it is always comes from the session; nothing in the body can choose the profile.
 */
function reply(result: ProfileWrite) {
  if (result.status === "ok") return NextResponse.json({ ok: true, username: result.username, created: result.created });
  if (result.status === "invalid") return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  if (result.status === "unavailable") return NextResponse.json({ ok: false, error: "Profile editing isn't switched on yet." }, { status: 503 });
  return NextResponse.json({ ok: false, error: "Couldn't save your profile. Try again." }, { status: 500 });
}

async function body(request: Request) {
  try { return await request.json(); } catch { return null; }
}

export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (current.status === "ok") return NextResponse.json({ ok: true, username: current.profile.username, created: false });
  const parsed = profileSetupFromBody(await body(request));
  if (!parsed.ok) return NextResponse.json({ ok: false, field: parsed.field, error: parsed.error }, { status: 400 });
  const result = await finishProfileSetup(current.account.id, parsed.input);
  if (result.status === "unverified") return NextResponse.json({ ok: false, error: "Verify your email first." }, { status: 403 });
  if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  return reply(result);
}

export async function PATCH(request: Request) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
  const parsed = profileEditFromBody(await body(request));
  if (!parsed.ok) return NextResponse.json({ ok: false, field: parsed.field, error: parsed.error }, { status: 400 });
  return reply(await updateMyProfile(current.profile.profileId, parsed.input));
}
