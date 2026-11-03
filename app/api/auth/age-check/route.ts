import { reply } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/auth/age-check — RETIRED (owner decision 2026-11-02). Sign-up no longer starts with the birthday: the account
 * is made first and the birthday is the onboarding step after Name (POST /api/account/birthday, 13+ only). Kept as a
 * fixed answer so an older app build gets a clear reply instead of a 404.
 */
export async function POST() {
  return reply(410, { ok: false, code: "retired", error: "Sign up with your email first. We'll ask your birthday after." });
}
