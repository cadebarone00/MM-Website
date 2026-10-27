import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { searchGolfers } from "@/lib/profile/friendRequestsServer";

/** GET ?q=: golfers whose name or @username has the words in it (2+ letters), with where I stand with each. Signed-in profiles only. */
export async function GET(request: Request) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const result = await searchGolfers(current.profile.profileId, new URL(request.url).searchParams.get("q") ?? "");
  return result.ok ? NextResponse.json({ ok: true, golfers: result.value }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json(result, { status: result.code === "not_installed" ? 503 : 500 });
}
