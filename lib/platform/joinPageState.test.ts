import { test } from "node:test";
import assert from "node:assert/strict";
import { joinPageState } from "./joinPageState.ts";
import type { JoinPreview } from "./golfTripJoinLinks.ts";

const base: JoinPreview = { tripId: "4ec7c3fa-19d3-4a7c-8398-ca3a93d72d44", tripName: "Pinehurst", destination: "Pinehurst, NC",
  startDate: "2027-04-22", endDate: "2027-04-26", organizerName: "Cade", status: "open" };

test("joinPageState picks what the join page shows", () => {
  assert.equal(joinPageState(null, true), "invalid");
  assert.equal(joinPageState(null, false), "invalid");
  assert.equal(joinPageState({ ...base, status: "expired" }, false), "expired");
  assert.equal(joinPageState({ ...base, status: "expired" }, true), "expired");
  assert.equal(joinPageState(base, false), "signed-out");
  assert.equal(joinPageState({ ...base, status: "member" }, false), "signed-out");
  assert.equal(joinPageState({ ...base, status: "member" }, true), "member");
  assert.equal(joinPageState(base, true), "open");
});
