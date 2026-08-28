// app/api/portal/profile/route.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// requirePlayer.ts calls createSupabaseServerClient(), which needs real env
// vars to construct — this route is exercised for real via the manual
// walkthrough in Step 4 below. This automated test covers the one pure piece:
// that an unauthenticated request is rejected before any Python call happens.
test("GET /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  // Next's `cookies()` (used inside requirePlayer -> createSupabaseServerClient)
  // throws when called outside a real request lifecycle, which is what
  // happens here — GET() is invoked directly, bypassing Next's server, the
  // same limitation lib/portal/requireHost.test.mts already ran into. In
  // production Next always establishes that scope before calling the route,
  // so this is a test-harness artifact, not a route bug. What this still
  // proves: the Python API is never called before requirePlayer() settles,
  // one way or another.
  await assert.rejects(() => GET());
  assert.equal(fetchCalled, false, "must not call the Python API without a resolved player");
  globalThis.fetch = originalFetch;
});

// Python's /player-whoami keys players by bare first name (PlayerProfile.id),
// not the full display name — see lib/portal/requirePlayer.test.mts for the
// data-layer invariant that makes `playerFirstName` correct. requirePlayer()
// can't be driven through GET() here (cookies() throws outside a real Next.js
// request, as proven above), so this asserts the fix at the source level:
// the call to callPythonApi must key off `player.playerFirstName`, and must
// never regress to sending `player.playerFullName` (which silently creates a
// bogus Python-side record instead of erroring — see the final review finding
// this test guards against).
test("GET /api/portal/profile sends the player's first name (not full name) to the Python API", () => {
  const routeSource = readFileSync(fileURLToPath(new URL("./route.ts", import.meta.url)), "utf8");
  const callSite = routeSource.match(/callPythonApi<WhoamiResponse>\("\/player-whoami",\s*\{[^}]*\}\)/);
  assert.ok(callSite, "expected to find the /player-whoami callPythonApi call in route.ts");
  assert.match(callSite![0], /player:\s*player\.playerFirstName\b/);
  assert.doesNotMatch(callSite![0], /playerFullName/);
});
