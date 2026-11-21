import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { PASSWORD_PENDING, passwordPending } from "@/lib/auth/signup";
import { crossSiteCookieRequest, reply, replyError } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/auth/create-password — { password } (owner decision 2026-11-20, project_specs.md "Sign up: email already has
 * an account + password AFTER the code"). The "Create a password" step that now comes right AFTER the email code.
 * - Only for the signed-in login that still has app_metadata password_pending (set by POST /api/auth/signup), so it
 *   can never be used to change an existing password without the current one (that's Settings → Change password).
 * - Website cookie or the app's Bearer login; a cookie request must come from our own pages.
 * - Saves the password and clears the flag in one server update. Every session stays signed in, so onboarding carries on.
 */
export async function POST(request: Request) {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return replyError(crossSite);
  const body = await request.json().catch(() => null) as { password?: unknown } | null;

  const { data: { user } } = await (await createSupabaseServerClient(request)).auth.getUser();
  if (!user) return reply(401, { ok: false, code: "signed_out", error: "Log in again to keep going." });
  if (!passwordPending(user)) return reply(409, { ok: false, code: "already_set", error: "Your password is already set." });

  const rules = checkNewPassword(body?.password);
  if (!rules.ok) return reply(400, { ok: false, code: "invalid_password", error: rules.error });

  const { error } = await createSupabaseServiceRoleClient().auth.admin.updateUserById(user.id, {
    password: body!.password as string,
    app_metadata: { [PASSWORD_PENDING]: null },
  });
  if (error) {
    console.error("create-password failed:", error.code ?? "", error.status ?? "");
    const weak = error.code === "weak_password";
    return reply(weak ? 400 : 503, { ok: false, code: weak ? "invalid_password" : "unavailable",
      error: weak ? "Pick a stronger password." : "We couldn't save your password. Try again." });
  }
  return reply(200, { ok: true });
}
