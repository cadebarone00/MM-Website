import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PASSWORD_LINK_ERROR } from "@/lib/auth/passwordSession";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { passwordErrorMessage } from "@/lib/auth/passwordErrors";
import { LINK_METHODS, signedInRecently } from "@/lib/account/reauth";

/**
 * The "set a new password" page behind a password-reset or invite email link (Accounts V2, phase A2).
 * - Only a session that came from such a link, used within the last hour, may set a password here. An ordinary
 *   signed-in session (e.g. a stolen cookie) is refused: changing a password while signed in goes through Settings →
 *   Change password, which needs the current password.
 * - Same password rules as everywhere (lib/auth/passwordPolicy.ts); Supabase checks again (and its leaked-password
 *   protection, when enabled).
 * - On success every session is signed out, the link's included, so a reset also locks out anyone else who was signed
 *   in. The person then signs in with the new password. Supabase's link tokens are single-use and expire.
 */
const LINK_SESSION_SECONDS = 60 * 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = user ? await supabase.auth.getSession() : { data: { session: null } };
  if (!user || !session) return NextResponse.json({ ok: false, error: PASSWORD_LINK_ERROR }, { status: 401 });
  if (!signedInRecently(session.access_token, Math.floor(Date.now() / 1000), LINK_SESSION_SECONDS, LINK_METHODS)) {
    return NextResponse.json({ ok: false, error: "This page only works from a password reset or invite email. To change your password while signed in, use Settings → Change password." }, { status: 403 });
  }
  const rules = checkNewPassword(body?.password);
  if (!rules.ok) return NextResponse.json({ ok: false, error: rules.error }, { status: 400 });
  const { error } = await supabase.auth.updateUser({ password: body!.password as string });
  if (error) {
    return NextResponse.json({ ok: false, error: error.name === "AuthSessionMissingError" ? PASSWORD_LINK_ERROR : passwordErrorMessage(error) }, { status: 400 });
  }
  await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
