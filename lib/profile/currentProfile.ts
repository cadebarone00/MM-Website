import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { profileIdentityFromRow, type ProfileId, type ProfileIdentity } from "./profileIdentity";

/**
 * "What profile does this signed-in account control?" — the one place to ask. The account comes from the session
 * only (never the request); the profile is the row whose id is that account's id (lib/profile/profileIdentity.ts).
 * New golf / product code should take `profile.profileId` from here rather than using `user.id` directly.
 *
 * Accounts V2 (supabase/profile_initialization.sql): a profile row can exist before setup is finished. That state is
 * "incomplete" and deliberately carries NO `profile`, so code written for golfers can't use it by accident. Only the
 * places allowed for unfinished profiles (accepting / viewing a Golf Trip) read its `profileId`, via tripProfileId().
 */
export type CurrentProfile =
  | { status: "signed-out" }
  /** Logged in, no profile row yet. Treat as "finish your profile" (initialization creates it); never guess one. */
  | { status: "no-profile"; account: User }
  /** Profile row exists, but no username or display name yet (setup not finished). */
  | { status: "incomplete"; account: User; profileId: ProfileId; displayName: string | null }
  | { status: "ok"; account: User; profile: ProfileIdentity };

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** Deletion requested or done for this account (supabase/account_deletion.sql)? False until that file is installed. */
async function isClosedAccount(accountId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("account_deletion_state", { p_account: accountId });
  return !error && !!((data ?? {}) as { state?: string | null }).state;
}

export const getCurrentProfile = cache(async (): Promise<CurrentProfile> => {
  return loadCurrentProfile(await createSupabaseServerClient());
});

/** Explicit request boundary for selected APIs; never caches an identity across requests. */
export async function getCurrentProfileForRequest(request: Request): Promise<CurrentProfile> {
  return loadCurrentProfile(await createSupabaseServerClient(request), true);
}

async function loadCurrentProfile(supabase: SupabaseClient, strict = false): Promise<CurrentProfile> {
  const read = await readCurrentProfile(supabase, strict);
  if (read.lookupFailed) throw new Error("Profile lookup unavailable.");
  return read.current;
}

type ProfileRead = { user: User | null; closed: boolean; current: CurrentProfile; lookupFailed: boolean };

/**
 * The session's login (if any) and its CurrentProfile; the lifecycle below reuses it so the session is read once.
 * `strictRead`: a failed profile query is reported (lookupFailed) instead of being treated as "no profile" — exactly
 * what getCurrentProfileForRequest has always done (it throws on it). The lifecycle first checks whether the failure is a
 * closed account (whose token can no longer read its row) before treating it as an error.
 */
async function readCurrentProfile(supabase: SupabaseClient, strictRead: boolean, checkClosedOnFailure = false): Promise<ProfileRead> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, closed: false, current: { status: "signed-out" }, lookupFailed: false };
  // Own row only (RLS profiles_select_own: auth.uid() = id).
  const { data: row, error } = await supabase.from("profiles").select("id, display_name, username, email, player_slug").eq("id", user.id).maybeSingle();
  if (strictRead && error) {
    const closed = checkClosedOnFailure && await isClosedAccount(user.id);
    return { user, closed, current: { status: "signed-out" }, lookupFailed: true };
  }
  const profile = profileIdentityFromRow(row);
  // A closed account (deletion requested or done; supabase/account_deletion.sql) can't read its own row any more:
  // treat it as signed out, never as "finish your profile".
  if (!profile) {
    const closed = await isClosedAccount(user.id);
    return { user, closed, current: closed ? { status: "signed-out" } : { status: "no-profile", account: user }, lookupFailed: false };
  }
  if (!filled(row?.username) || !filled(row?.display_name)) {
    return { user, closed: false, current: { status: "incomplete", account: user, profileId: profile.profileId, displayName: filled(row?.display_name) ? String(row?.display_name) : null }, lookupFailed: false };
  }
  return { user, closed: false, current: { status: "ok", account: user, profile }, lookupFailed: false };
}

/** For "not a finished golfer" answers: an unfinished profile gets the same reply as a missing one. */
export function notGolfer(current: Exclude<CurrentProfile, { status: "ok" }>): "signed-out" | "no-profile" {
  return current.status === "signed-out" ? "signed-out" : "no-profile";
}

// === Account lifecycle (Pending accounts Phase 2; project_specs.md "Pending accounts, onboarding activation & 13+") =====
// A SEPARATE answer from CurrentProfile. CurrentProfile ("ok" = name + username) still drives every existing route
// unchanged, because activation and enforcement are not switched on yet (Phase 5). The lifecycle says whether the
// account has been ACTIVATED (Finish) — something a name and username never imply.
//
// It is read from the database's account_lifecycle_state() (supabase/account_activation.sql). Where that file isn't
// installed the answer is "unavailable": never a guess, and never Active. Only the account's own server code sees it;
// it carries no birthdate, age or eligibility reason.

/** Name/username progress of a Pending account: no profile row yet, row without name or username, or both filled. */
export type PendingDetails = "missing" | "incomplete" | "complete";

export type AccountLifecycle =
  | { state: "signed-out" }
  /** Logged in, Finish has not succeeded. No golf access once enforcement is on, whatever name/username it has. */
  | { state: "pending"; account: User; profileId: ProfileId | null; details: PendingDetails }
  /** Finish succeeded, birthday on file and 13+, not restricted. */
  | { state: "active"; account: User; profile: ProfileIdentity }
  /** An activated legacy account with no birthday yet: must do the Birthday step before golf features. */
  | { state: "active_needs_birthday"; account: User; profile: ProfileIdentity }
  /** Under 13 (or otherwise age-ineligible). Deliberately no reason, date or age. */
  | { state: "ineligible"; account: User }
  /** Held for manual review (e.g. a birthday-correction case). */
  | { state: "restricted"; account: User }
  /** Deletion requested or done. Existing deletion protections apply exactly as before. */
  | { state: "deleted"; account: User }
  /** The lifecycle can't be determined safely: the migration isn't installed, the lookup failed, or the data disagrees. */
  | { state: "unavailable"; account: User; reason: "foundation_missing" | "lookup_failed" | "inconsistent" };

/** What the database answered for account_lifecycle_state(); `missing` = the function doesn't exist there. */
export type LifecycleLookup = { ok: true; state: string } | { ok: false; missing: boolean };

const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/** True when a Supabase RPC error means "no such function" (the migration isn't installed), not a real failure. */
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return MISSING_FUNCTION_CODES.has(error.code ?? "") || /could not find the function|function .* does not exist/i.test(error.message ?? "");
}

/**
 * Pure mapping (unit tested): the session's CurrentProfile + whether its account is closed + the database's lifecycle
 * word → AccountLifecycle. Never upgrades to Active on missing or unexpected data.
 */
export function lifecycleFromLookup(user: User | null, closed: boolean, current: CurrentProfile, lookup: LifecycleLookup): AccountLifecycle {
  if (!user) return { state: "signed-out" };
  if (closed) return { state: "deleted", account: user };
  if (!lookup.ok) return { state: "unavailable", account: user, reason: lookup.missing ? "foundation_missing" : "lookup_failed" };
  switch (lookup.state) {
    case "closed": return { state: "deleted", account: user };
    case "ineligible": return { state: "ineligible", account: user };
    case "review": return { state: "restricted", account: user };
    case "pending":
      if (current.status === "ok") return { state: "pending", account: user, profileId: current.profile.profileId, details: "complete" };
      if (current.status === "incomplete") return { state: "pending", account: user, profileId: current.profileId, details: "incomplete" };
      if (current.status === "no-profile") return { state: "pending", account: user, profileId: null, details: "missing" };
      return { state: "unavailable", account: user, reason: "inconsistent" };
    case "active":
    case "active_needs_birthday":
      // Activation requires a finished profile; anything else means the data disagrees, so don't call it active.
      if (current.status !== "ok") return { state: "unavailable", account: user, reason: "inconsistent" };
      return { state: lookup.state, account: user, profile: current.profile };
    default:
      // "no_account" for a live session, or a word this code doesn't know: never guess.
      return { state: "unavailable", account: user, reason: "inconsistent" };
  }
}

async function lookupLifecycle(accountId: string): Promise<LifecycleLookup> {
  // account_lifecycle_state() is granted to service_role only (browsers can't call it); the id comes from the session.
  const { data, error } = await createSupabaseServiceRoleClient().rpc("account_lifecycle_state", { p_account: accountId });
  if (error) return { ok: false, missing: isMissingFunctionError(error) };
  return typeof data === "string" ? { ok: true, state: data } : { ok: false, missing: false };
}

async function loadAccountLifecycle(supabase: SupabaseClient, strict: boolean): Promise<AccountLifecycle> {
  const { user, closed, current, lookupFailed } = await readCurrentProfile(supabase, true, true);
  if (!user) return { state: "signed-out" };
  if (closed) return { state: "deleted", account: user };
  if (lookupFailed) {
    if (strict) throw new Error("Account state unavailable.");
    return { state: "unavailable", account: user, reason: "lookup_failed" };
  }
  const lookup = await lookupLifecycle(user.id);
  if (strict && !lookup.ok && !lookup.missing) throw new Error("Account state unavailable.");
  return lifecycleFromLookup(user, closed, current, lookup);
}

/** The signed-in account's lifecycle (web cookie session). Not used by existing routes yet. */
export const getAccountLifecycle = cache(async (): Promise<AccountLifecycle> => {
  return loadAccountLifecycle(await createSupabaseServerClient(), false);
});

/** Same, for one request: web cookie OR `Authorization: Bearer` (the iOS / Android app). Throws on a failed lookup. */
export async function getAccountLifecycleForRequest(request: Request): Promise<AccountLifecycle> {
  return loadAccountLifecycle(await createSupabaseServerClient(request), true);
}

/** The profile id allowed to accept / view Golf Trips: finished or unfinished profiles (requirement: trip invites work
 *  before setup is done; scoring and competition still need a finished profile). Null when there is no profile row. */
export function tripProfileId(current: CurrentProfile): ProfileId | null {
  if (current.status === "ok") return current.profile.profileId;
  if (current.status === "incomplete") return current.profileId;
  return null;
}
