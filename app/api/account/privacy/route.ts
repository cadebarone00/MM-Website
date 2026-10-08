import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { roundsVisibilityFromBody } from "@/lib/platform/playerRoundsPrivacy";
import { setMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";

/** Settings → Privacy: PUT { visibility: "public" | "private" } for the signed-in golfer's profile (its Rounds). */
export async function PUT(request: Request) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to change your privacy." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });

  const visibility = roundsVisibilityFromBody(await request.json().catch(() => null));
  if (!visibility) return NextResponse.json({ ok: false, error: "Choose Public or Private." }, { status: 400 });

  const result = await setMyRoundsVisibility(current.profile.profileId, visibility);
  if (result === "not-installed") return NextResponse.json({ ok: false, error: "Privacy settings aren't switched on yet." }, { status: 503 });
  if (result === "failed") return NextResponse.json({ ok: false, error: "We couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, visibility });
}
