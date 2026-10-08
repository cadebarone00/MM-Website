import assert from "node:assert/strict";
import test from "node:test";
import { inviteStatusesFromJson, isPlayerId, playerAcceptResultFromJson, playerDeclineResultFromJson, playerInvitationFromJson } from "./tournamentPlayerInvitations";

test("player ids are uuids; anything else is refused before the database", () => {
  assert.equal(isPlayerId("6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d"), true);
  for (const v of ["", "p1", "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3dX", "../x"]) assert.equal(isPlayerId(v), false, v);
});

test("the invite preview keeps only what may be shown (no email, no profile ids)", () => {
  const raw = { tournamentId: "t", tournamentName: "Texas Cup", tournamentSlug: "texas-cup", playerName: "Ann Lee", status: "open", email: "ann@x", profileId: "p" };
  assert.deepEqual(playerInvitationFromJson(raw), { tournamentId: "t", tournamentName: "Texas Cup", tournamentSlug: "texas-cup", playerName: "Ann Lee", status: "open" });
  assert.equal(playerInvitationFromJson({ ...raw, status: "weird" }), null);
  assert.equal(playerInvitationFromJson(null), null);
});

test("accept results are checked", () => {
  assert.deepEqual(playerAcceptResultFromJson({ status: "accepted", tournamentId: "t" }), { status: "accepted", tournamentId: "t" });
  assert.deepEqual(playerAcceptResultFromJson({ status: "already_player", tournamentId: "t" }), { status: "already_player", tournamentId: "t" });
  assert.deepEqual(playerAcceptResultFromJson({ status: "claimed" }), { status: "claimed" });
  assert.deepEqual(playerAcceptResultFromJson({ status: "accepted" }), { status: "not_found" });
});

test("decline replies and organizer invite statuses are checked", () => {
  assert.equal(playerDeclineResultFromJson({ status: "declined" }), "declined");
  assert.equal(playerDeclineResultFromJson({ status: "already_player" }), "already_player");
  assert.equal(playerDeclineResultFromJson({ status: "x" }), "not_found");
  assert.deepEqual(inviteStatusesFromJson({ a: "joined", b: "invited", c: "declined", d: "none", e: "hacked" }), { a: "joined", b: "invited", c: "declined", d: "none" });
  assert.deepEqual(inviteStatusesFromJson(null), {});
});
