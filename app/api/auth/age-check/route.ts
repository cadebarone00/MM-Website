import { cookies } from "next/headers";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { crossSiteCookieRequest, reply, replyError, service } from "@/lib/account/onboardingApiServer";
import { AGE_PASS_COOKIE, NOT_ELIGIBLE, ageCheckInputFromBody, agePassCookieOptions, newAgePass } from "@/lib/auth/agePass";

/**
 * POST /api/auth/age-check — { birthdate: "YYYY-MM-DD", client?: "app" }: the FIRST sign-up step (G4, birthday-first).
 * Nothing about the person exists yet: no account, no email. Under 13 -> the same neutral answer every time and NOTHING is
 * stored (no row, no hash). 13+ -> the database keeps a 30-minute pass (supabase/signup_gate.sql issue_age_pass, with the
 * birthdate held server-side) under the SHA-256 of a random nonce; the website gets the nonce in an HttpOnly cookie, the
 * app in the reply. Sign-up must present it, and Supabase's Before User Created hook refuses any new login without it.
 * Off unless MAROON_V2_ONBOARDING=on.
 */
export async function POST(request: Request) {
  if (!onboardingEnabled()) return reply(404, { ok: false, code: "not_found", error: "Not found." });
  const body = await request.json().catch(() => null);
  const parsed = ageCheckInputFromBody(body);
  if (!parsed.ok) return reply(400, { ok: false, code: "invalid_input", error: parsed.error });
  if (!parsed.app) {
    const crossSite = crossSiteCookieRequest(request);
    if (crossSite) return replyError(crossSite);
  }
  if (!parsed.eligible) return reply(200, { ok: true, eligible: false, error: NOT_ELIGIBLE });

  const pass = newAgePass();
  const { data, error } = await service().rpc("issue_age_pass", { p_birthdate: parsed.birthdate, p_nonce_hash: pass.nonceHash });
  if (error || (data as { eligible?: unknown } | null)?.eligible !== true) {
    // The database's own age rule disagreeing with ours (time zone at midnight) also lands here: no pass, try again.
    if (error) console.error("age-check failed:", error.code ?? "");
    return reply(error ? 503 : 200, error ? { ok: false, code: "unavailable", error: "We couldn't check that. Try again." } : { ok: true, eligible: false, error: NOT_ELIGIBLE });
  }
  if (parsed.app) return reply(200, { ok: true, eligible: true, agePass: pass.nonce, expiresInMinutes: 30 });
  (await cookies()).set(AGE_PASS_COOKIE, pass.nonce, agePassCookieOptions(new URL(request.url).protocol === "https:"));
  return reply(200, { ok: true, eligible: true });
}
