import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { friendRequestCount, removeFriend, respondFriendRequest, sendFriendRequest } from "@/lib/profile/friendRequestsServer";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** GET: how many friend requests are waiting on me (the red badge). 0 when signed out. */
export async function GET() {
  const current = await getCurrentProfile();
  const count = current.status === "ok" ? await friendRequestCount(current.profile.profileId) : 0;
  return NextResponse.json({ ok: true, count }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * POST { to } asks that golfer to be friends · { request, accept } answers a request sent to me · { remove } stops being
 * friends with that golfer (request friends only). Signed-in profiles only.
 */
export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const body = await request.json().catch(() => null) as { to?: unknown; request?: unknown; accept?: unknown; remove?: unknown } | null;
  const me = current.profile.profileId;
  if (uuid(body?.remove)) {
    const removed = await removeFriend(me, body.remove);
    if (!removed.ok) return NextResponse.json(removed, { status: removed.code === "not_installed" ? 503 : 500 });
    return removed.value ? NextResponse.json({ ok: true, relation: "none" })
      : NextResponse.json({ ok: false, message: "You're friends from a golf trip together, so that friendship stays." }, { status: 400 });
  }
  const result = uuid(body?.to) ? await sendFriendRequest(me, body.to, new URL(request.url).origin)
    : uuid(body?.request) && typeof body.accept === "boolean" ? await respondFriendRequest(me, body.request, body.accept)
    : null;
  if (!result) return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true, relation: result.value })
    : NextResponse.json(result, { status: result.code === "refused" ? 400 : result.code === "not_installed" ? 503 : 500 });
}
