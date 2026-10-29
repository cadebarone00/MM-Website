import { acceptedVersionsFromBody, apiError, blockedLifecycle, type CurrentVersions } from "@/lib/account/onboardingApi";
import { accountIdOf, callerLifecycle, crossSiteCookieRequest, logFailure, reply, replyError, service } from "@/lib/account/onboardingApiServer";

/**
 * Terms of Service / Privacy Policy acceptance (Pending accounts Phase 3; project_specs.md §9).
 * GET  → { ok, terms, privacy }: the CURRENT version names only (no legal text; null until final documents exist).
 * POST → { termsVersion, privacyVersion } for the signed-in, VERIFIED account: records "Terms agreed / Privacy
 *        acknowledged" for exactly those current versions. Recorded after verification (not inside the sign-up request)
 *        so an acceptance can only ever be attached to the account's proven owner, for email and Apple/Google alike.
 * Draft documents are never treated as final: until the owner sets versions in the database, POST answers
 * terms_not_configured and Finish stays blocked.
 */
async function currentVersions(): Promise<CurrentVersions | null> {
  const { data, error } = await service().from("legal_document_versions").select("document, current_version");
  if (error) return null;
  const find = (doc: string) => (data ?? []).find((r) => r.document === doc)?.current_version ?? null;
  return { terms: find("terms"), privacy: find("privacy") };
}

export async function GET() {
  const versions = await currentVersions();
  if (!versions) return replyError(apiError(503, "unavailable", "The Terms aren't available yet."));
  return reply(200, { ok: true, ...versions });
}

export async function POST(request: Request) {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return replyError(crossSite);
  const caller = await callerLifecycle(request);
  if ("error" in caller) return replyError(caller.error);
  const blocked = blockedLifecycle(caller.lifecycle, ["pending", "active", "active_needs_birthday"]);
  if (blocked) return replyError(blocked);
  const account = (caller.lifecycle as { account: { id: string; email_confirmed_at?: string | null; app_metadata?: { provider?: string } } }).account;
  if (!account.email_confirmed_at && (account.app_metadata?.provider ?? "email") === "email") {
    return replyError(apiError(403, "unverified", "Verify your email first."));
  }

  const versions = await currentVersions();
  if (!versions) return replyError(apiError(503, "unavailable", "The Terms aren't available yet."));
  const accepted = acceptedVersionsFromBody(await request.json().catch(() => null), versions);
  if ("status" in accepted) return replyError(accepted);

  const db = service();
  const accountId = accountIdOf(caller.lifecycle)!;
  const provider = account.app_metadata?.provider ?? "email";
  for (const [document, version] of [["terms", accepted.terms], ["privacy", accepted.privacy]] as const) {
    const before = await db.from("terms_acceptances").select("version").eq("account_id", accountId).eq("document", document).limit(1);
    const method = (before.data?.length ?? 0) > 0 ? "reaccept" : provider === "email" ? "signup" : "oauth";
    const { error } = await db.rpc("record_terms_acceptance", { p_account: accountId, p_document: document, p_version: version, p_method: method });
    if (error) {
      logFailure("terms", error);
      if (/not the current version|not available/i.test(error.message ?? "")) {
        return replyError(apiError(409, "version_mismatch", "The Terms or Privacy Policy changed. Review the latest version and accept again."));
      }
      return replyError(apiError(500, "failed", "We couldn't save that. Try again."));
    }
  }
  return reply(200, { ok: true, terms: accepted.terms, privacy: accepted.privacy });
}
