import { test } from "node:test";
import assert from "node:assert/strict";
import { golfTripJoinPath, linkNeedsRefresh, isJoinCode, joinLinkFromJson, joinPreviewFromJson, joinResultFromJson, newJoinCode } from "./golfTripJoinLinks.ts";

const TRIP = "4ec7c3fa-19d3-4a7c-8398-ca3a93d72d44";

test("isJoinCode accepts generated codes and rejects bad ones", () => {
  assert.equal(isJoinCode(newJoinCode()), true);
  for (const bad of ["", "short", "a".repeat(65), "has space 0123456789abcdefghijkl", null, 42]) assert.equal(isJoinCode(bad), false, String(bad));
});

test("newJoinCode is random and 32 url-safe characters", () => {
  const [a, b] = [newJoinCode(), newJoinCode()];
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
});

test("golfTripJoinPath", () => {
  assert.equal(golfTripJoinPath("abc"), "/golf-trips/join/abc");
});

test("joinPreviewFromJson keeps a valid preview and drops anything else", () => {
  const good = { tripId: TRIP, tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", organizerName: "Cade", status: "open" };
  assert.deepEqual(joinPreviewFromJson(good), good);
  assert.deepEqual(joinPreviewFromJson({ ...good, status: "expired" })?.status, "expired");
  assert.equal(joinPreviewFromJson({ ...good, organizerName: null })?.organizerName, null);
  for (const bad of [null, {}, { ...good, status: "weird" }, { ...good, tripId: 5 }]) assert.equal(joinPreviewFromJson(bad), null);
});

test("joinResultFromJson", () => {
  assert.deepEqual(joinResultFromJson({ status: "joined", tripId: TRIP }), { status: "joined", tripId: TRIP });
  assert.deepEqual(joinResultFromJson({ status: "already_member", tripId: TRIP }), { status: "already_member", tripId: TRIP });
  assert.deepEqual(joinResultFromJson({ status: "expired" }), { status: "expired" });
  assert.deepEqual(joinResultFromJson({ status: "joined" }), { status: "not_found" });
  assert.deepEqual(joinResultFromJson("nope"), { status: "not_found" });
});

test("joinLinkFromJson builds the absolute url", () => {
  const code = newJoinCode();
  assert.deepEqual(joinLinkFromJson({ code, expiresAt: "2027-01-01T00:30:00+00:00" }, "https://maroon.app"),
    { code, url: `https://maroon.app/golf-trips/join/${code}`, expiresAt: "2027-01-01T00:30:00+00:00" });
  assert.equal(joinLinkFromJson(null, "https://maroon.app"), null);
  assert.equal(joinLinkFromJson({ code: "bad", expiresAt: "x" }, "https://maroon.app"), null);
});

test("linkNeedsRefresh: no link, expired, or 5 minutes or less left", () => {
  const now = Date.parse("2027-01-01T00:00:00Z");
  const at = (minutes: number) => ({ code: newJoinCode(), url: "u", expiresAt: new Date(now + minutes * 60000).toISOString() });
  assert.equal(linkNeedsRefresh(null, now), true);
  assert.equal(linkNeedsRefresh(at(-1), now), true);
  assert.equal(linkNeedsRefresh(at(5), now), true);
  assert.equal(linkNeedsRefresh(at(6), now), false);
  assert.equal(linkNeedsRefresh({ code: "x", url: "u", expiresAt: "not a date" }, now), true);
});
