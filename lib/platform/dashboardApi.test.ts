import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardFailure, publishDecision, readinessFor } from "./dashboardApi.ts";
import { createdSetup, playableSetup } from "./testFixtures.ts";

test("the server refuses to publish an incomplete setup and says what's missing; unpublishing is always allowed", () => {
  const setup = createdSetup();
  const refused = publishDecision(setup, true);
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.status, 409);
  assert.ok(!refused.ok && refused.missing?.includes("Choose the scoring rules"));
  assert.deepEqual(publishDecision(setup, false), { ok: true });
  setup.edition.publishedAt = "2027-01-01T00:00:00Z";
  assert.deepEqual(publishDecision(setup, true), { ok: true }, "re-publishing an already published edition is harmless");
});

test("commercial tournaments never get live scoring before C4; only the legacy (Maroon) tournament does", () => {
  const commercial = readinessFor(playableSetup());
  assert.equal(commercial.stage, "Blocked");
  assert.equal(commercial.playReady, false);
  const legacySetup = playableSetup();
  legacySetup.tournament.isLegacy = true;
  const legacy = readinessFor(legacySetup);
  assert.equal(legacy.stage, "Ready to Play");
  assert.equal(legacy.playReady, true);
});

test("'not allowed' looks like 'not found', so private tournaments aren't confirmed to outsiders", () => {
  assert.deepEqual(dashboardFailure({ code: "42501", message: "Not found." }), { status: 404, error: "Not found." });
  assert.equal(dashboardFailure({ code: "42501", message: "The Maroon Tournament is managed in the Admin Center." }).status, 403);
  assert.equal(dashboardFailure({ code: "42501", message: "Hosted media isn't available for this tournament." }).status, 403);
  assert.deepEqual(dashboardFailure({ code: "22023", message: "Unknown team." }), { status: 400, error: "Unknown team." });
  assert.equal(dashboardFailure({ code: "23503" }).status, 400);
  assert.equal(dashboardFailure({ code: "PGRST202" }).status, 503);
  assert.equal(dashboardFailure({ code: "XX000" }).status, 500);
});
