import assert from "node:assert/strict";
import test from "node:test";
import { acceptResultFromJson, declineResultFromJson, inviteInputFromBody, isInviteToken } from "./golfTripInvitations";

test("the invite form becomes a name + optional email; nothing else is accepted", () => {
  assert.deepEqual(inviteInputFromBody({ displayName: "  John Smith ", email: " John@Email.com " }), { ok: true, input: { displayName: "John Smith", email: "john@email.com" } });
  assert.deepEqual(inviteInputFromBody({ displayName: "John", email: "" }), { ok: true, input: { displayName: "John", email: null } });
  assert.deepEqual(inviteInputFromBody({ displayName: "John", profileId: "someone", email: null }), { ok: true, input: { displayName: "John", email: null } }, "a profile can't be named by the organizer");
  for (const body of [null, {}, { displayName: " " }, { displayName: "x".repeat(121) }, { displayName: "John", email: "not-an-email" }, { displayName: 5 }]) {
    assert.equal(inviteInputFromBody(body).ok, false, JSON.stringify(body));
  }
});

test("invite secrets are long URL-safe strings; anything else is ignored before the database", () => {
  assert.equal(isInviteToken("abcdefghijklmnopqrstuvwxyzABCDEF012345_-"), true);
  for (const token of ["short", "has spaces in it 0123456789abcdefghijk", "x".repeat(201), "../../etc/passwd/0123456789abcdefghijk"]) assert.equal(isInviteToken(token), false, token);
});

test("accept results are checked", () => {
  assert.deepEqual(acceptResultFromJson({ status: "accepted", tripId: "t1" }), { status: "accepted", tripId: "t1" });
  assert.deepEqual(acceptResultFromJson({ status: "already_member", tripId: "t1" }), { status: "already_member", tripId: "t1" });
  assert.deepEqual(acceptResultFromJson({ status: "claimed" }), { status: "claimed" });
  assert.deepEqual(acceptResultFromJson({ status: "weird" }), { status: "not_found" });
  assert.deepEqual(acceptResultFromJson({ status: "accepted" }), { status: "not_found" }, "accepted without a trip is not trusted");
});

test("decline results are checked", () => {
  assert.equal(declineResultFromJson({ status: "declined" }), "declined");
  assert.equal(declineResultFromJson({ status: "already_member" }), "already_member");
  assert.equal(declineResultFromJson({ status: "nope" }), "not_found");
  assert.equal(declineResultFromJson(null), "not_found");
});
