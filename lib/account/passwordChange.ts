import "server-only";
import { createClient } from "@supabase/supabase-js";
import { accountForRequest } from "@/lib/profile/profileInitialization";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { passwordErrorMessage } from "@/lib/auth/passwordErrors";

/**
 * Settings → Change password (Accounts V2, phase A2).
 * 1. Who: the verified session (cookie or bearer), never the form.
 * 2. Proof: the CURRENT password, checked by Supabase for that account's own email (a stolen session alone can't do it).
 * 3. The new password goes through Supabase's own update (its length limit, and leaked-password protection when
 *    enabled), from the fresh session that proof created. No password is stored or hashed here.
 * 4. Every OTHER session is signed out. The caller keeps working on the fresh session (the route swaps its cookies,
 *    or hands the tokens back to a native app).
 */
export type PasswordChangeResult =
  | { status: "ok"; session: { access_token: string; refresh_token: string } }
  | { status: "signed-out" }
  | { status: "wrong-current" }
  | { status: "rate-limited" }
  | { status: "invalid"; error: string }
  | { status: "failed" };

export async function changeMyPassword(request: Request, currentPassword: unknown, newPassword: unknown): Promise<PasswordChangeResult> {
  const account = await accountForRequest(request);
  if (!account?.email) return { status: "signed-out" };
  if (typeof currentPassword !== "string" || !currentPassword) return { status: "wrong-current" };
  const rules = checkNewPassword(newPassword);
  if (!rules.ok) return { status: "invalid", error: rules.error };
  if (newPassword === currentPassword) return { status: "invalid", error: "Your new password must be different from the current one." };

  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const proof = await client.auth.signInWithPassword({ email: account.email, password: currentPassword });
  if (proof.error || !proof.data.session) {
    if (proof.error?.status === 429) return { status: "rate-limited" };
    return { status: "wrong-current" };
  }
  if (proof.data.user?.id !== account.id) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { status: "signed-out" };
  }
  const { error } = await client.auth.updateUser({ password: newPassword as string });
  if (error) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { status: "invalid", error: passwordErrorMessage(error) };
  }
  // Supabase already ends other sessions on a password change; do it explicitly too.
  await client.auth.signOut({ scope: "others" }).catch(() => undefined);
  const { data: { session } } = await client.auth.getSession();
  return session ? { status: "ok", session: { access_token: session.access_token, refresh_token: session.refresh_token } } : { status: "failed" };
}
