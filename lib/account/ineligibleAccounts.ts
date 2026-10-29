import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { processAccountDeletion, type DeletionOptions, type DeletionState } from "./accountDeletion";

/**
 * Pending accounts Phase 4 — what happens to an Ineligible (under-13) account after the database has marked it
 * (supabase/account_activation.sql). Server-only; the account id always comes from a verified session or from the
 * database's own retry list, never from a request body.
 *
 *   1. Revoke: every sign-in session ends at once. The database already did this in the same transaction that marked
 *      the account Ineligible (revoke_account_sessions); it's repeated here (idempotent) so a retry can never leave a
 *      session alive, and the caller's own token is also signed out through Supabase Auth when we have it.
 *   2. Decide (close_ineligible_registration, serialized per account): REMOVE only a never-activated account with no
 *      records anyone else relies on; otherwise LOCK it (restricted, hidden, records kept) for an admin to review.
 *   3. Remove: the EXISTING account-deletion workflow (anonymous profile tombstone, files, login hard-deleted), which is
 *      resumable; anything left half-way is finished by the retry job (/api/internal/account-deletions).
 * Logs carry operation names and database error codes only — never birthdates, emails or names.
 */

export type IneligibleOutcome =
  | { status: "removed"; deletion: DeletionState }
  | { status: "locked"; blockers: string[] }
  | { status: "not_ineligible" }
  | { status: "unavailable" }
  | { status: "failed" };

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

export type CleanupOptions = { accessToken?: string | null; deletion?: DeletionOptions };

/** Run (or re-run) revocation + the cleanup decision + removal for ONE Ineligible account. Safe to repeat or race. */
export async function restrictAndCleanUpIneligible(accountId: string, options: CleanupOptions = {}): Promise<IneligibleOutcome> {
  const service = createSupabaseServiceRoleClient();

  const lifecycle = await service.rpc("account_lifecycle_state", { p_account: accountId });
  if (lifecycle.error) return isMissing(lifecycle.error) ? { status: "unavailable" } : { status: "failed" };
  // A removal already under way: the account is closed (deleted) — just make sure the deletion finishes.
  if (lifecycle.data === "closed") return { status: "removed", deletion: await processAccountDeletion(accountId, options.deletion) };
  if (lifecycle.data !== "ineligible") return { status: "not_ineligible" };

  if (options.accessToken) await service.auth.admin.signOut(options.accessToken, "global").catch(() => undefined);
  const revoked = await service.rpc("revoke_account_sessions", { p_account: accountId });
  if (revoked.error) {
    console.error("ineligible cleanup: revoke failed:", revoked.error.code ?? "unknown");
    return isMissing(revoked.error) ? { status: "unavailable" } : { status: "failed" };
  }

  const decision = await service.rpc("close_ineligible_registration", { p_account: accountId, p_remove: true });
  if (decision.error) {
    console.error("ineligible cleanup: decision failed:", decision.error.code ?? "unknown");
    return isMissing(decision.error) ? { status: "unavailable" } : { status: "failed" };
  }
  const result = (decision.data ?? {}) as { action?: string; blockers?: unknown };
  if (result.action === "lock") {
    return { status: "locked", blockers: Array.isArray(result.blockers) ? result.blockers.filter((b): b is string => typeof b === "string") : [] };
  }
  if (result.action !== "remove") return { status: "failed" };
  return { status: "removed", deletion: await processAccountDeletion(accountId, options.deletion) };
}

/** Retry job: Ineligible accounts whose cleanup was never decided (server stopped mid-way). Counts only. */
export async function resumeIneligibleCleanups(options: CleanupOptions = {}): Promise<{ processed: number; removed: number; locked: number; failed: number }> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("pending_ineligible_cleanups", { p_limit: 50 });
  if (error) {
    if (isMissing(error)) return { processed: 0, removed: 0, locked: 0, failed: 0 }; // foundation not installed: nothing to do
    throw new Error(`pending_ineligible_cleanups failed: ${error.code ?? "unknown"}`);
  }
  const totals = { processed: 0, removed: 0, locked: 0, failed: 0 };
  for (const row of (data ?? []) as { account_id: string }[]) {
    const outcome = await restrictAndCleanUpIneligible(row.account_id, { deletion: options.deletion });
    totals.processed++;
    if (outcome.status === "removed") totals.removed++;
    else if (outcome.status === "locked") totals.locked++;
    else if (outcome.status === "failed" || outcome.status === "unavailable") totals.failed++;
  }
  return totals;
}
