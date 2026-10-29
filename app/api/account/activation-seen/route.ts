import { NextResponse } from "next/server";
import { ACTIVATION_MARKER_COOKIE } from "@/lib/account/activationMarker";

/**
 * POST /api/account/activation-seen (Phase 7A) — Profile Created calls this once it is on screen, which removes the
 * one-time marker, so refreshing or coming back later goes to Play instead of showing "Profile Created!" again.
 * Only ever deletes this browser's own marker cookie; changes nothing else.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ACTIVATION_MARKER_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
