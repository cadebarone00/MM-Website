import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { respondFriendRequest, sendFriendRequest } from "@/lib/profile/friendRequestsServer";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** POST { to } asks that golfer to be friends; POST { request, accept } answers a request sent to me. Signed-in profiles only. */
export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const body = await request.json().catch(() => null) as { to?: unknown; request?: unknown; accept?: unknown } | null;
  const me = current.profile.profileId;
  const result = uuid(body?.to) ? await sendFriendRequest(me, body.to)
    : uuid(body?.request) && typeof body.accept === "boolean" ? await respondFriendRequest(me, body.request, body.accept)
    : null;
  if (!result) return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true, relation: result.value })
    : NextResponse.json(result, { status: result.code === "refused" ? 400 : result.code === "not_installed" ? 503 : 500 });
}
