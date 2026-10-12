import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { playedWith } from "@/lib/profile/compareServer";

/** Profile → Stats → Compare: people I've played with (rounds with friends, golf trips). */
export async function GET() {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  return NextResponse.json({ ok: true, people: await playedWith(current.profile.profileId) }, { headers: { "Cache-Control": "no-store" } });
}
