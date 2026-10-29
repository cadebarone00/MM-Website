import { checkBirthdate } from "@/lib/account/age";
import { restrictAndCleanUpIneligible } from "@/lib/account/ineligibleAccounts";
import { apiError, birthdayReply, blockedLifecycle } from "@/lib/account/onboardingApi";
import { accountIdOf, callerAccessToken, callerLifecycle, crossSiteCookieRequest, logFailure, reply, replyError, service, signOutThisBrowser } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/account/birthday — { birthdate: "YYYY-MM-DD" } (Pending accounts Phase 3, + Phase 4 under-13 handling).
 * The signed-in account's OWN birthday, saved once (set_my_birthdate; corrections go through
 * POST /api/account/birthday-correction + support). Replies only { eligible, next } — never the date or an age.
 * Under 13: the database marks the account Ineligible AND ends every session in the same transaction; this route then
 * runs the safe cleanup (remove a clean new account through the deletion workflow, or lock one with records for review),
 * signs this browser out, and answers { eligible: false, next: "ineligible", signedOut: true } — the same answer whether
 * the account was removed or locked. Cookie or Bearer session; any account id in the body is ignored.
 */
export async function POST(request: Request) {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return replyError(crossSite);
  const caller = await callerLifecycle(request);
  if ("error" in caller) return replyError(caller.error);
  const blocked = blockedLifecycle(caller.lifecycle, ["pending", "active_needs_birthday", "active"]);
  if (blocked) return replyError(blocked);
  const accountId = accountIdOf(caller.lifecycle)!;

  const birthdate = (await request.json().catch(() => null) as { birthdate?: unknown } | null)?.birthdate;
  const check = checkBirthdate(birthdate);
  if (!check.ok) return replyError(apiError(400, "invalid_birthdate", "Enter your real date of birth."));

  // Taken before the database revokes the sessions, so Supabase Auth can sign this exact token out too.
  const accessToken = await callerAccessToken(request);
  // The database decides (write-once, 13+ on its own calendar); this route never keeps or logs the value.
  const { data, error } = await service().rpc("set_my_birthdate", { p_account: accountId, p_birthdate: birthdate });
  if (error && !/already saved|real date/i.test(error.message ?? "")) logFailure("birthday", error);
  const result = birthdayReply(error, data);
  if (!result.body.ok || result.body.eligible) return reply(result.status, result.body);

  // Under 13. The account is already Ineligible with no live sessions; a cleanup failure here is retried by the job.
  const outcome = await restrictAndCleanUpIneligible(accountId, { accessToken });
  if (outcome.status === "failed" || outcome.status === "unavailable") console.error("ineligible cleanup deferred:", outcome.status);
  await signOutThisBrowser(request);
  return reply(200, { ...result.body, signedOut: true });
}
