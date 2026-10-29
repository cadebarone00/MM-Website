import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import type { AccountLifecycle } from "../profile/currentProfile.ts";
import type { ProfileId, ProfileIdentity } from "../profile/profileIdentity.ts";
import { acceptedVersionsFromBody, birthdayReply, blockedLifecycle, correctionReasonFromBody, correctionReply, finishReply, resumeReply,
  type OnboardingProgress } from "./onboardingApi.ts";

// Pure rules behind POST /api/account/birthday, /finish, /birthday-correction, /terms and GET /api/account/onboarding.

const account = { id: "22222222-2222-4222-8222-222222222222" } as User;
const profile = { profileId: account.id as ProfileId } as ProfileIdentity;
const pending = (details: "missing" | "incomplete" | "complete"): AccountLifecycle => ({ state: "pending", account, profileId: details === "missing" ? null : profile.profileId, details });
/** The error code of any reply (undefined for successes). */
const code = (r: { body: unknown }) => (r.body as { code?: string }).code;
const progress = (p: Partial<OnboardingProgress> = {}): OnboardingProgress =>
  ({ verified: true, birthday: true, termsConfigured: true, termsAccepted: true, activationEnabled: true, ...p });

test("resume: Pending accounts go to their first unfinished required step, in the approved order", () => {
  assert.equal(resumeReply(pending("complete"), progress({ verified: false })).body.next, "verification");
  assert.equal(resumeReply(pending("missing"), progress()).body.next, "name_username");
  assert.equal(resumeReply(pending("incomplete"), progress()).body.next, "name_username");
  assert.equal(resumeReply(pending("complete"), progress({ birthday: false })).body.next, "birthday");
  assert.equal(resumeReply(pending("complete"), progress({ termsAccepted: false })).body.next, "terms");
  assert.equal(resumeReply(pending("complete"), progress()).body.next, "settings", "photo is optional: Settings (with Finish) is next");
  assert.equal(resumeReply(pending("complete"), progress({ termsConfigured: false, termsAccepted: false })).body.next, "settings",
    "unconfigured Terms don't send people to an empty Terms step");
});

test("resume: activationAvailable only when the switch is on AND legal versions exist", () => {
  assert.equal((resumeReply(pending("complete"), progress()).body as { activationAvailable: boolean }).activationAvailable, true);
  assert.equal((resumeReply(pending("complete"), progress({ activationEnabled: false })).body as { activationAvailable: boolean }).activationAvailable, false);
  assert.equal((resumeReply(pending("complete"), progress({ termsConfigured: false })).body as { activationAvailable: boolean }).activationAvailable, false);
});

test("resume: Active -> play, legacy without birthday -> birthday, blocked states never reach Play", () => {
  assert.deepEqual(resumeReply({ state: "active", account, profile }, null), { status: 200, body: { ok: true, state: "active", next: "play", activationAvailable: false } });
  assert.equal(resumeReply({ state: "active_needs_birthday", account, profile }, null).body.next, "birthday");
  assert.equal(resumeReply({ state: "ineligible", account }, null).body.next, "ineligible");
  assert.equal(resumeReply({ state: "restricted", account }, null).body.next, "restricted");
  assert.equal(resumeReply({ state: "deleted", account }, null).body.next, "closed");
  assert.deepEqual(resumeReply({ state: "signed-out" }, null), { status: 401, body: { ok: false, code: "signed_out", next: "welcome" } });
  assert.deepEqual(resumeReply({ state: "unavailable", account, reason: "foundation_missing" }, null), { status: 503, body: { ok: false, code: "unavailable", next: null } });
  assert.equal(resumeReply(pending("complete"), null).status, 503, "progress unreadable -> unavailable, not a guess");
});

test("blocked lifecycles get fixed, non-revealing replies", () => {
  assert.equal(blockedLifecycle({ state: "signed-out" }, ["pending"])?.status, 401);
  assert.equal(blockedLifecycle({ state: "unavailable", account, reason: "foundation_missing" }, ["pending"])?.status, 503);
  assert.deepEqual(blockedLifecycle({ state: "ineligible", account }, ["pending"])?.body.code, "not_eligible");
  assert.deepEqual(blockedLifecycle({ state: "restricted", account }, ["pending"])?.body.code, "restricted");
  assert.deepEqual(blockedLifecycle({ state: "deleted", account }, ["pending"])?.body.code, "account_closed");
  assert.equal(blockedLifecycle(pending("complete"), ["pending"]), null);
});

test("birthday replies: eligible yes/no only; repeat, invalid, missing database", () => {
  assert.deepEqual(birthdayReply(null, { eligible: true }), { status: 200, body: { ok: true, eligible: true, next: "settings" } });
  assert.deepEqual(birthdayReply(null, { eligible: false }), { status: 200, body: { ok: true, eligible: false, next: "ineligible" } });
  assert.equal(code(birthdayReply({ code: "22023", message: "Your birthday is already saved. Contact support to correct it." }, null)), "birthday_already_saved");
  assert.equal(birthdayReply({ code: "22023", message: "Enter your real date of birth." }, null).status, 400);
  assert.equal(birthdayReply({ code: "PGRST202", message: "Could not find the function" }, null).status, 503);
  assert.equal(code(birthdayReply({ code: "08006", message: "connection failure 1999-01-01" }, null)), "failed");
  assert.ok(!JSON.stringify(birthdayReply({ code: "08006", message: "connection failure 1999-01-01" }, null)).includes("1999"), "raw messages never echoed");
  assert.equal(birthdayReply(null, { something: 1 }).status, 500, "unexpected data is not success");
});

test("finish replies: success only when activated AND confirmed active", () => {
  const ok = finishReply(null, { activated: true, already: false, invitations: [{ outcome: "accepted", tripId: "t1", kind: "golf_trip" }] }, "active");
  assert.deepEqual(ok, { status: 200, body: { ok: true, activated: true, already: false, invitations: [{ outcome: "accepted", tripId: "t1" }] } });
  assert.equal(finishReply(null, { activated: true, already: true }, "active").status, 200);
  assert.equal(code(finishReply(null, { activated: true }, "pending")), "not_confirmed", "database said yes but read-back disagrees");
  assert.equal(code(finishReply(null, { activated: true }, null)), "not_confirmed");
  assert.deepEqual(finishReply(null, { activated: false, missing: ["birthday", "terms"] }, null).body, { ok: false, code: "incomplete",
    error: "A few things are still needed before you can finish.", missing: ["birthday", "terms"] });
  assert.equal(code(finishReply(null, { activated: false, state: "ineligible" }, null)), "not_eligible");
  assert.equal(code(finishReply({ code: "55000", message: "Activation is not enabled yet." }, null, null)), "activation_disabled");
  assert.equal(code(finishReply({ code: "PGRST202", message: "Could not find the function public.activate_my_profile" }, null, null)), "unavailable");
  assert.equal(finishReply(null, null, null).status, 500);
  assert.equal(finishReply(null, { activated: "yes" }, "active").status, 500, "only a real true activates");
});

test("birthday correction: reason rules and replies (duplicate, rate limit, no birthday)", () => {
  assert.equal(correctionReasonFromBody({ reason: "  wrong year  " }), "wrong year");
  for (const bad of [null, {}, { reason: "" }, { reason: "   " }, { reason: 5 }, { reason: "x".repeat(501) }]) assert.equal(correctionReasonFromBody(bad), null);
  assert.deepEqual(correctionReply(null), { status: 200, body: { ok: true, status: "received" } });
  assert.equal(code(correctionReply({ code: "22023", message: "You already have an open correction request." })), "already_open");
  assert.equal(correctionReply({ code: "54000", message: "Too many correction requests. Contact support." }).status, 429);
  assert.equal(code(correctionReply({ code: "22023", message: "There is no birthday to correct." })), "no_birthday");
});

test("terms: both CURRENT versions required; nothing accepted before legal versions exist", () => {
  const current = { terms: "t-2027-01", privacy: "p-2027-01" };
  assert.deepEqual(acceptedVersionsFromBody({ termsVersion: "t-2027-01", privacyVersion: "p-2027-01" }, current), { terms: "t-2027-01", privacy: "p-2027-01" });
  assert.equal((acceptedVersionsFromBody({ termsVersion: "t-2026-12", privacyVersion: "p-2027-01" }, current) as { body: { code: string } }).body.code, "version_mismatch");
  assert.equal((acceptedVersionsFromBody({ termsVersion: "t-2027-01" }, current) as { body: { code: string } }).body.code, "version_mismatch");
  assert.equal((acceptedVersionsFromBody({ termsVersion: "x", privacyVersion: "y" }, { terms: null, privacy: null }) as { body: { code: string } }).body.code, "terms_not_configured");
});
