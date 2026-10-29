import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import { isMissingFunctionError, lifecycleFromLookup, type CurrentProfile, type LifecycleLookup } from "./currentProfile.ts";
import type { ProfileId, ProfileIdentity } from "./profileIdentity.ts";

// Pure mapping from the database's account_lifecycle_state() word to the server lifecycle (Pending accounts Phase 2).

const user = { id: "11111111-1111-4111-8111-111111111111" } as User;
const profileId = user.id as ProfileId;
const identity = { profileId } as ProfileIdentity;
const ok: CurrentProfile = { status: "ok", account: user, profile: identity };
const incomplete: CurrentProfile = { status: "incomplete", account: user, profileId, displayName: null };
const missingProfile: CurrentProfile = { status: "no-profile", account: user };
const found = (state: string): LifecycleLookup => ({ ok: true, state });

test("signed out stays signed out whatever the database says", () => {
  assert.deepEqual(lifecycleFromLookup(null, false, { status: "signed-out" }, found("active")), { state: "signed-out" });
});

test("pending is pending however complete the name and username are", () => {
  assert.deepEqual(lifecycleFromLookup(user, false, missingProfile, found("pending")), { state: "pending", account: user, profileId: null, details: "missing" });
  assert.deepEqual(lifecycleFromLookup(user, false, incomplete, found("pending")), { state: "pending", account: user, profileId, details: "incomplete" });
  const complete = lifecycleFromLookup(user, false, ok, found("pending"));
  assert.equal(complete.state, "pending", "name + username present is NOT active");
  assert.deepEqual(complete, { state: "pending", account: user, profileId, details: "complete" });
});

test("active and legacy active-without-birthday keep the same permanent profile identity", () => {
  assert.deepEqual(lifecycleFromLookup(user, false, ok, found("active")), { state: "active", account: user, profile: identity });
  assert.deepEqual(lifecycleFromLookup(user, false, ok, found("active_needs_birthday")), { state: "active_needs_birthday", account: user, profile: identity });
});

test("ineligible and restricted carry no reason, date or age; never active", () => {
  const ineligible = lifecycleFromLookup(user, false, ok, found("ineligible"));
  assert.deepEqual(ineligible, { state: "ineligible", account: user });
  assert.deepEqual(lifecycleFromLookup(user, false, ok, found("review")), { state: "restricted", account: user });
  assert.ok(!/birth|age|reason|under/i.test(JSON.stringify(ineligible).replace(user.id, "")), "nothing private in the answer");
});

test("deleted accounts are deleted, from the existing closed check or the database", () => {
  assert.deepEqual(lifecycleFromLookup(user, true, { status: "signed-out" }, { ok: false, missing: true }), { state: "deleted", account: user },
    "the existing deletion check wins even without the new migration");
  assert.deepEqual(lifecycleFromLookup(user, false, ok, found("closed")), { state: "deleted", account: user });
});

test("missing foundation or failed lookup is an explicit safe state, never Active", () => {
  for (const current of [ok, incomplete, missingProfile]) {
    assert.deepEqual(lifecycleFromLookup(user, false, current, { ok: false, missing: true }), { state: "unavailable", account: user, reason: "foundation_missing" });
    assert.deepEqual(lifecycleFromLookup(user, false, current, { ok: false, missing: false }), { state: "unavailable", account: user, reason: "lookup_failed" });
  }
});

test("data that disagrees is never upgraded to Active", () => {
  assert.equal(lifecycleFromLookup(user, false, incomplete, found("active")).state, "unavailable", "active without a finished profile");
  assert.equal(lifecycleFromLookup(user, false, missingProfile, found("active_needs_birthday")).state, "unavailable");
  assert.equal(lifecycleFromLookup(user, false, ok, found("no_account")).state, "unavailable", "a live session the database doesn't know");
  assert.equal(lifecycleFromLookup(user, false, ok, found("superuser")).state, "unavailable", "unknown word");
  assert.equal(lifecycleFromLookup(user, false, { status: "signed-out" }, found("pending")).state, "unavailable");
});

test("recognises 'function not installed' errors from PostgREST and Postgres only", () => {
  assert.equal(isMissingFunctionError({ code: "PGRST202", message: "Could not find the function public.account_lifecycle_state(p_account) in the schema cache" }), true);
  assert.equal(isMissingFunctionError({ code: "42883", message: "function public.account_lifecycle_state(uuid) does not exist" }), true);
  assert.equal(isMissingFunctionError({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(isMissingFunctionError({ code: "42501", message: "permission denied for function account_lifecycle_state" }), false);
  assert.equal(isMissingFunctionError(null), false);
});
