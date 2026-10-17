import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { accountForRequest } from "@/lib/profile/profileInitialization";
import { signedInRecently, REAUTH_WINDOW_SECONDS } from "./reauth";

/**
 * Permanent account deletion (Accounts V2, Step 3; supabase/account_deletion.sql). Resumable state machine:
 *   requested -> database_done -> storage_done -> auth_done -> completed
 * 1. request: the signed-in person, recently re-authenticated, for THEIR OWN account only (id from the verified
 *    session; nothing in the request can name another account). The ledger row blocks the account everywhere at once;
 *    then every session is signed out.
 * 2. database: one transaction (trip hand-off / archive / restrict, personal rows removed, shared rows de-identified,
 *    profile tombstoned).
 * 3. storage: the person's files removed through the Storage API (owned by them, or under their profile-photos folder).
 * 4. auth: the login HARD-deleted (soft delete leaves a revivable account: docs/auth-deletion-test-2026-10-17.md).
 *    "User not found" counts as done, so an interruption right after the delete is safe to retry.
 * Every step can run again safely; resumeAccountDeletions() finishes anything left half-way.
 */
export type DeletionStep = "database" | "storage" | "auth";
export type DeletionState = "requested" | "database_done" | "storage_done" | "auth_done" | "completed";
/** Test seam only: make one step fail (or fail right after Auth deleted the login, before it was recorded). */
export type DeletionOptions = { failAt?: DeletionStep | "auth-after-delete"; nowSeconds?: number; reauthWindowSeconds?: number };
export type RequestResult =
  | { status: "ok"; state: DeletionState }
  | { status: "signed-out" }
  | { status: "reauth-required" }
  | { status: "failed" };

class InjectedFailure extends Error {}

async function accessTokenFor(request: Request): Promise<string | null> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (bearer) return bearer;
  const { data } = await (await createSupabaseServerClient()).auth.getSession();
  return data.session?.access_token ?? null;
}

async function state(accountId: string): Promise<DeletionState | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("account_deletion_state", { p_account: accountId });
  if (error) throw new Error(`account_deletion_state failed: ${error.message}`);
  return ((data ?? {}) as { state?: DeletionState | null }).state ?? null;
}

async function record(accountId: string, step: "storage" | "auth" | "completed", ok: boolean, error?: string) {
  const { error: rpcError } = await createSupabaseServiceRoleClient().rpc("record_account_deletion_step",
    { p_account: accountId, p_step: step, p_ok: ok, p_error: error ?? null });
  if (rpcError) throw new Error(`record_account_deletion_step failed: ${rpcError.message}`);
}

/** Start deleting the signed-in person's own account. */
export async function requestAccountDeletion(request: Request, options: DeletionOptions = {}): Promise<RequestResult> {
  const account = await accountForRequest(request);
  const token = account ? await accessTokenFor(request) : null;
  if (!account || !token) return { status: "signed-out" };
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!signedInRecently(token, now, options.reauthWindowSeconds ?? REAUTH_WINDOW_SECONDS)) return { status: "reauth-required" };
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.rpc("request_account_deletion", { p_account: account.id });
  if (error) {
    console.error("request_account_deletion failed:", error.message);
    return { status: "failed" };
  }
  // The ledger already blocks every API; also end every session so no refresh token can mint new access tokens.
  await service.auth.admin.signOut(token, "global").catch(() => undefined);
  return { status: "ok", state: await processAccountDeletion(account.id, options) };
}

/** Run (or resume) the remaining steps for one account. Returns the state reached; never throws on a step failure. */
export async function processAccountDeletion(accountId: string, options: DeletionOptions = {}): Promise<DeletionState> {
  const service = createSupabaseServiceRoleClient();
  for (let guard = 0; guard < 6; guard++) {
    const current = await state(accountId);
    if (!current || current === "completed") return current ?? "completed";
    try {
      if (current === "requested") {
        if (options.failAt === "database") throw new InjectedFailure("database");
        const { error } = await service.rpc("execute_account_deletion", { p_account: accountId });
        if (error) throw new Error(`database: ${error.code ?? error.message}`);
      } else if (current === "database_done") {
        if (options.failAt === "storage") throw new InjectedFailure("storage");
        const { data, error } = await service.rpc("list_account_storage_objects", { p_account: accountId });
        if (error) throw new Error(`storage_list: ${error.code ?? "error"}`);
        const byBucket = new Map<string, string[]>();
        for (const row of (data ?? []) as { bucket_id: string; name: string }[]) byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
        for (const [bucket, names] of byBucket) {
          const { error: removeError } = await service.storage.from(bucket).remove(names);
          if (removeError) throw new Error(`storage_remove: ${bucket}`);
        }
        const { data: left } = await service.rpc("list_account_storage_objects", { p_account: accountId });
        if ((left ?? []).length) throw new Error("storage_remaining");
        await record(accountId, "storage", true);
      } else if (current === "storage_done") {
        if (options.failAt === "auth") throw new InjectedFailure("auth");
        const { error } = await service.auth.admin.deleteUser(accountId); // HARD delete
        if (error && !/not.?found/i.test(error.message)) throw new Error(`auth_delete: ${error.status ?? "error"}`);
        if (options.failAt === "auth-after-delete") throw new InjectedFailure("auth-after-delete");
        await record(accountId, "auth", true);
      } else if (current === "auth_done") {
        await record(accountId, "completed", true);
      }
    } catch (error) {
      const step = current === "requested" ? "database" : current === "database_done" ? "storage" : "auth";
      const code = error instanceof InjectedFailure ? `injected_${error.message}` : (error as Error).message.slice(0, 120);
      if (step !== "database") await record(accountId, step, false, code).catch(() => undefined);
      return (await state(accountId)) ?? current;
    }
  }
  return (await state(accountId)) ?? "completed";
}

/** Retry sweeper: finish every deletion left half-way (run by /api/internal/account-deletions). */
export async function resumeAccountDeletions(options: DeletionOptions = {}): Promise<{ accountId: string; state: DeletionState }[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("pending_account_deletions", { p_limit: 50 });
  if (error) throw new Error(`pending_account_deletions failed: ${error.message}`);
  const results = [];
  for (const row of (data ?? []) as { account_id: string }[]) results.push({ accountId: row.account_id, state: await processAccountDeletion(row.account_id, options) });
  return results;
}

/** Remove files that still belong to finished deletions (uploaded in the last moment, or a Storage hiccup). */
export async function sweepOrphanedDeletionFiles(): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("orphaned_deleted_account_objects", { p_limit: 200 });
  if (error) throw new Error(`orphaned_deleted_account_objects failed: ${error.message}`);
  const byBucket = new Map<string, string[]>();
  for (const row of (data ?? []) as { bucket_id: string; name: string }[]) byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    const { error: removeError } = await service.storage.from(bucket).remove(names);
    if (!removeError) removed += names.length;
  }
  return removed;
}

/**
 * Re-authentication for the delete form: the person types their password; Supabase checks it for THEIR email (taken
 * from the verified session, never the form). Returns a request carrying the fresh token, or null when it's wrong.
 */
export async function requestWithFreshSignIn(accountEmail: string | undefined, password: string): Promise<Request | null> {
  if (!accountEmail || !password) return null;
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: accountEmail, password });
  if (error || !data.session) return null;
  return new Request("http://internal/account/delete", { method: "POST", headers: { authorization: `Bearer ${data.session.access_token}` } });
}

export type TripPlan = {
  tripId: string; name: string; startDate: string; endDate: string; ended: boolean;
  outcome: "transfer" | "archive" | "restrict";
  handoff: { toProfileId: string; toName: string; state: "pending" | "accepted" | "declined" } | null;
  eligible: { memberId: string; name: string }[];
};
export type DeletionPreview = {
  trips: TripPlan[];
  counts: { tripsJoined: number; sharedRoundsHosted: number; tournamentRoles: number; legacyPlayer: boolean; personalRounds: number;
    sharedRounds: number; scorecards: number; openBets: number; files: number };
};

/** What deleting would do for this profile (the database applies the same rules). Null before account_deletion.sql. */
export async function deletionPreview(profileId: string): Promise<DeletionPreview | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("account_deletion_preview", { p_profile: profileId });
  if (error) return null;
  return data as DeletionPreview;
}

export type OrganizerOffer = { tripId: string; tripName: string; startDate: string; endDate: string; fromName: string; accepted: boolean; declined: boolean };
export async function myOrganizerOffers(profileId: string): Promise<OrganizerOffer[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_organizer_offers", { p_profile: profileId });
  return error ? [] : (data as OrganizerOffer[]) ?? [];
}

type HandoffResult = { status: "ok" } | { status: "invalid"; error: string } | { status: "forbidden"; error: string } | { status: "failed" };
const handoffFailure = (fn: string, error: { code?: string; message: string }): HandoffResult => {
  if (error.code === "22023") return { status: "invalid", error: error.message };
  if (error.code === "42501") return { status: "forbidden", error: error.message };
  console.error(`${fn} failed:`, error.code ?? "");
  return { status: "failed" };
};

/** Organizer asks a joined trip member (by their member row on THIS trip) to take over. */
export async function offerTripToMember(profileId: string, tripId: string, memberId: string): Promise<HandoffResult> {
  const service = createSupabaseServiceRoleClient();
  const { data: member } = await service.from("golf_trip_members").select("profile_id").eq("id", memberId).eq("golf_trip_id", tripId).maybeSingle();
  const toProfile = (member as { profile_id?: string | null } | null)?.profile_id;
  if (!toProfile) return { status: "invalid", error: "Pick a member who has joined the trip and finished their profile." };
  const { error } = await service.rpc("offer_golf_trip_organizer", { p_profile: profileId, p_trip: tripId, p_to_profile: toProfile });
  return error ? handoffFailure("offer_golf_trip_organizer", error) : { status: "ok" };
}

export async function cancelTripOffer(profileId: string, tripId: string): Promise<HandoffResult> {
  const { error } = await createSupabaseServiceRoleClient().rpc("cancel_golf_trip_organizer", { p_profile: profileId, p_trip: tripId });
  return error ? handoffFailure("cancel_golf_trip_organizer", error) : { status: "ok" };
}

/** The invited member answers (accept takes on the organizer role if the organizer deletes their account). */
export async function answerTripOffer(profileId: string, tripId: string, accept: boolean): Promise<HandoffResult> {
  const fn = accept ? "accept_golf_trip_organizer" : "decline_golf_trip_organizer";
  const { error } = await createSupabaseServiceRoleClient().rpc(fn, { p_profile: profileId, p_trip: tripId });
  return error ? handoffFailure(fn, error) : { status: "ok" };
}
