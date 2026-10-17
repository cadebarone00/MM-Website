import { NextResponse } from "next/server";
import { initializeCurrentProfile } from "@/lib/profile/profileInitialization";

/**
 * POST /api/account/initialize — make sure the signed-in, verified account has its profile (Accounts V2). For the web
 * (cookie session) and other clients such as the iOS app (`Authorization: Bearer <access token>`). There is no body:
 * the account always comes from the verified session, so it can't be pointed at anyone else. Safe to call any number
 * of times. Answers whether the profile still needs Finish setup (`complete: false`).
 */
export async function POST(request: Request) {
  const result = await initializeCurrentProfile(request);
  const headers = { "Cache-Control": "no-store" };
  if (result.status === "ok") return NextResponse.json({ ok: true, created: result.created, complete: result.complete, claimedPlayer: result.claimedPlayer }, { headers });
  if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
  if (result.status === "unverified") return NextResponse.json({ ok: false, error: "Verify your email first." }, { status: 403, headers });
  if (result.status === "unavailable") return NextResponse.json({ ok: false, error: "Profiles aren't switched on yet." }, { status: 503, headers });
  return NextResponse.json({ ok: false, error: "Couldn't set up your profile. Try again." }, { status: 500, headers });
}
