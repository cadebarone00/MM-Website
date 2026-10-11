import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { compareWith } from "@/lib/profile/compareServer";

/** Profile → Stats → Compare: GET /api/profile/compare?u=<username> → that player's stats (always for a trip friend, else if their Privacy allows). */
export async function GET(request: Request) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  const result = await compareWith(current.profile.profileId, new URL(request.url).searchParams.get("u") ?? "");
  return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
}
