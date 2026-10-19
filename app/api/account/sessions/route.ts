import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutDevices, type SessionScope } from "@/lib/account/sessions";

/**
 * POST /api/account/sessions — Settings → Account → Devices. Body: { scope: "others" | "global", password }.
 * "others": every other device is signed out; this one stays signed in (web cookies swapped to a fresh session, a
 * native app gets its new tokens). "global": every device, this one included.
 */
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { scope?: unknown; password?: unknown } | null;
  const scope: SessionScope | null = body?.scope === "others" || body?.scope === "global" ? body.scope : null;
  if (!scope) return NextResponse.json({ ok: false, error: "Choose other devices or everywhere." }, { status: 400, headers });
  const result = await signOutDevices(request, scope, body?.password);
  switch (result.status) {
    case "signed-out": return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401, headers });
    case "reauth-required": return NextResponse.json({ ok: false, reauth: true, error: "Enter your password to confirm it's you." }, { status: 401, headers });
    case "wrong-password": return NextResponse.json({ ok: false, reauth: true, error: "That password isn't right." }, { status: 401, headers });
    case "rate-limited": return NextResponse.json({ ok: false, error: "Too many tries. Wait a few minutes and try again." }, { status: 429, headers });
    case "failed": return NextResponse.json({ ok: false, error: "We couldn't sign out your devices. Try again." }, { status: 500, headers });
  }
  const bearer = /^Bearer\s+/i.test(request.headers.get("authorization") ?? "");
  if (result.scope === "global") {
    // This device was signed out too: clear the web cookies (the session is already gone on the server).
    if (!bearer) await (await createSupabaseServerClient()).auth.signOut({ scope: "local" }).catch(() => undefined);
    return NextResponse.json({ ok: true, scope: "global", signedOut: true }, { headers });
  }
  if (bearer) return NextResponse.json({ ok: true, scope: "others", session: result.session }, { headers });
  await (await createSupabaseServerClient()).auth.setSession(result.session!).catch(() => undefined);
  return NextResponse.json({ ok: true, scope: "others" }, { headers });
}
