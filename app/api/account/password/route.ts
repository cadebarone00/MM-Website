import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changeMyPassword } from "@/lib/account/passwordChange";

/**
 * POST /api/account/password — Settings → Change password. Body: { currentPassword, newPassword }.
 * The account comes from the session (cookie or bearer); the current password is required. On success every other
 * device is signed out. This device stays signed in: web cookies are switched to the new session; a bearer (native)
 * caller gets the new session's tokens back to store.
 */
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const result = await changeMyPassword(request, body?.currentPassword, body?.newPassword);
  switch (result.status) {
    case "signed-out": return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
    case "wrong-current": return NextResponse.json({ ok: false, field: "currentPassword", error: "Your current password isn't right." }, { status: 401, headers });
    case "rate-limited": return NextResponse.json({ ok: false, error: "Too many tries. Wait a few minutes and try again." }, { status: 429, headers });
    case "invalid": return NextResponse.json({ ok: false, field: "newPassword", error: result.error }, { status: 400, headers });
    case "failed": return NextResponse.json({ ok: false, error: "We couldn't finish. Sign in with your new password; if that doesn't work, use your old one and try again." }, { status: 500, headers });
  }
  if (/^Bearer\s+/i.test(request.headers.get("authorization") ?? "")) {
    return NextResponse.json({ ok: true, session: result.session }, { headers });
  }
  // Web: replace this browser's (now signed-out) session with the fresh one.
  await (await createSupabaseServerClient()).auth.setSession(result.session).catch(() => undefined);
  return NextResponse.json({ ok: true }, { headers });
}
