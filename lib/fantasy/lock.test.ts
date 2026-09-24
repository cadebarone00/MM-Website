import { test } from "node:test";
import assert from "node:assert/strict";
import { fantasyPicksLocked } from "./lock.ts";

// nextTournament (2027-upcoming.ts): liveAt "2027-01-06T09:30:00-06:00", endDate "2027-01-09".
test("fantasyPicksLocked is false before the tournament goes live", () => {
  assert.equal(fantasyPicksLocked(new Date("2026-01-01T00:00:00-06:00")), false);
});

test("fantasyPicksLocked is true once the tournament is live", () => {
  assert.equal(fantasyPicksLocked(new Date("2027-01-06T10:00:00-06:00")), true);
});

test("fantasyPicksLocked is true once the tournament has completed", () => {
  assert.equal(fantasyPicksLocked(new Date("2027-01-10T00:00:00-06:00")), true);
});
