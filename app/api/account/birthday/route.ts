import { checkBirthdate } from "@/lib/account/age";
import { apiError, birthdayReply, blockedLifecycle } from "@/lib/account/onboardingApi";
import { accountIdOf, callerLifecycle, crossSiteCookieRequest, logFailure, reply, replyError, service } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/account/birthday — { birthdate: "YYYY-MM-DD" } (Pending accounts Phase 3). The signed-in account's OWN
 * birthday, saved once (set_my_birthdate; corrections go through POST /api/account/birthday-correction + support).
 * Replies only { eligible, next } — never the date or an age. Under 13 makes the account Ineligible in the same database
 * step; every account API then refuses it. Cookie or Bearer session; any account id in the body is ignored.
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

  // The database decides (write-once, 13+ on its own calendar); this route never keeps or logs the value.
  const { data, error } = await service().rpc("set_my_birthdate", { p_account: accountId, p_birthdate: birthdate });
  if (error && !/already saved|real date/i.test(error.message ?? "")) logFailure("birthday", error);
  const result = birthdayReply(error, data);
  return reply(result.status, result.body);
}
