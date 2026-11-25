import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteLinkState, tripPageState } from "./tripPageRules.ts";

test("trip page: not found, signed out, other errors, imported and live", () => {
  assert.deepEqual(tripPageState({ ok: false, error: "Trip not found." }), { kind: "not-found" });
  assert.deepEqual(tripPageState({ ok: false, error: "Sign in to see this trip." }), { kind: "signed-out" });
  assert.deepEqual(tripPageState({ ok: false, error: "You're signed out. Sign in again." }), { kind: "signed-out" });
  assert.deepEqual(tripPageState({ ok: false, error: "Couldn't load this trip. Try again." }), { kind: "error", message: "Couldn't load this trip. Try again." });
  const imported = { status: "imported", savedTrip: { trip: { name: "Pinehurst 2024" } } } as never;
  assert.deepEqual(tripPageState({ ok: true, data: imported }), { kind: "imported", name: "Pinehurst 2024", data: imported });
  assert.deepEqual(tripPageState({ ok: true, data: { status: "not-found" } }), { kind: "not-found" });
  const live = { status: "live" } as never;
  assert.equal(tripPageState({ ok: true, data: live }).kind, "live");
});

test("invite link box: the link, switched off, offline, or the server's message", () => {
  const link = { code: "abc", url: "https://www.themaroon.site/golf-trips/join/abc", expiresAt: "2999-01-01T00:00:00Z" };
  assert.deepEqual(inviteLinkState(200, link), { status: "ok", link });
  assert.deepEqual(inviteLinkState(503, { error: "Invite links aren't switched on yet." }), { status: "off" });
  assert.equal(inviteLinkState(0, null).status, "error");
  assert.deepEqual(inviteLinkState(404, { error: "Trip not found." }), { status: "error", message: "Trip not found." });
  assert.deepEqual(inviteLinkState(500, null), { status: "error", message: "Couldn't get the invite link. Try again." });
});
