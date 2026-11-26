/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { answeredOffer, canConfirmDelete, tokensFrom, tripDay } from "./settingsUi.ts";

test("tokensFrom reads the new session, and nothing else", () => {
  assert.deepEqual(tokensFrom({ ok: true, session: { access_token: "a", refresh_token: "r", extra: 1 } }), { access_token: "a", refresh_token: "r" });
  assert.equal(tokensFrom({ ok: true }), null);
  assert.equal(tokensFrom({ session: { access_token: "a" } }), null);
  assert.equal(tokensFrom({ session: { access_token: "", refresh_token: "r" } }), null);
  assert.equal(tokensFrom(null), null);
});

test("Delete needs a password and DELETE in capitals", () => {
  assert.equal(canConfirmDelete("pw", "DELETE", false), true);
  assert.equal(canConfirmDelete("pw", " DELETE ", false), true);
  assert.equal(canConfirmDelete("pw", "delete", false), false);
  assert.equal(canConfirmDelete("", "DELETE", false), false);
  assert.equal(canConfirmDelete("pw", "DELETE", true), false);
});

test("answering an offer flips accepted/declined", () => {
  const offer = { tripId: "t", tripName: "Trip", fromName: "Al", accepted: false, declined: false };
  assert.deepEqual(answeredOffer(offer, true), { ...offer, accepted: true, declined: false });
  assert.deepEqual(answeredOffer(offer, false), { ...offer, accepted: false, declined: true });
});

test("tripDay writes a short date and leaves junk alone", () => {
  assert.equal(tripDay("2027-03-03"), "Mar 3, 2027");
  assert.equal(tripDay("soon"), "soon");
});
