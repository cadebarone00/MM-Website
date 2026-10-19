import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign out = THIS device only (Accounts V2, phase A4; Supabase `scope: "local"`). The session is ended on the server
 * too, so its access token stops working at once (supabase/account_deletion.sql session_is_revoked), not just its
 * cookies. Other devices stay signed in: "Sign out of other devices" / "everywhere" live in Settings
 * (/api/account/sessions). Password reset and account deletion still sign out everywhere on purpose.
 * Web: the cookie session. Native (iOS): `Authorization: Bearer <access token>` ends that token's session.
 * Also removes this device's trip push subscription (body `endpoint`).
 */
export async function POST(request: Request) {
  const service = createSupabaseServiceRoleClient();
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const supabase = bearer ? null : await createSupabaseServerClient();
  const user = bearer ? (await service.auth.getUser(bearer)).data.user : (await supabase!.auth.getUser()).data.user;
  const body = await request.json().catch(() => null);
  if (user && typeof body?.endpoint === "string") {
    const { error } = await service.from("trip_push_subscriptions").delete().eq("profile_id", user.id).eq("endpoint", body.endpoint);
    // Missing migration has no subscriptions to remove; other failures must be surfaced before sign-out.
    if (error && error.code !== "42P01" && error.code !== "PGRST205") return NextResponse.json({ error: "Could not disable device alerts." }, { status: 503 });
  }
  if (bearer) await service.auth.admin.signOut(bearer, "local").catch(() => undefined);
  else await supabase!.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
