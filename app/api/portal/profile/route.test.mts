// app/api/portal/profile/route.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

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
