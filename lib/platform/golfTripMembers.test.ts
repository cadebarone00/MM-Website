import assert from "node:assert/strict";
import test from "node:test";
import type { SavedGolfTrip } from "./golfTripCreate";
import { acceptedMembers, memberState, membersForViewer } from "./golfTripMembers";

type Member = SavedGolfTrip["members"][number];
const m = (id: string, profileId: string | null, role: Member["role"], invitationStatus: string, email: string | null): Member =>
  ({ id, profileId, displayName: id, email, role, invitationStatus });
const MEMBERS: Member[] = [
  m("cade", "p-cade", "organizer", "accepted", "cade@test"),
  m("john", "p-john", "member", "accepted", "john@test"),
  m("pete", null, "member", "pending", "pete@test"),
  m("mike", null, "member", "declined", "mike@test"),
];

test("the organizer sees everyone's invite email; a member sees only their own", () => {
  assert.deepEqual(membersForViewer(MEMBERS, "p-cade").map((x) => x.email), ["cade@test", "john@test", "pete@test", "mike@test"]);
  assert.deepEqual(membersForViewer(MEMBERS, "p-john").map((x) => x.email), [null, "john@test", null, null]);
  assert.equal(JSON.stringify(membersForViewer(MEMBERS, "p-john")).includes("pete@test"), false, "not in the payload at all");
  assert.deepEqual(membersForViewer(MEMBERS, "p-stranger").map((x) => x.email), [null, null, null, null]);
});

test("organizer / accepted / pending / declined are told apart; only accepted members with a profile are players", () => {
  assert.deepEqual(MEMBERS.map(memberState), ["organizer", "accepted", "pending", "declined"]);
  assert.deepEqual(acceptedMembers(MEMBERS).map((x) => x.id), ["cade", "john"]);
  assert.deepEqual(acceptedMembers([m("odd", null, "member", "accepted", null)]), [], "accepted without a profile (deleted account) isn't a player");
});
