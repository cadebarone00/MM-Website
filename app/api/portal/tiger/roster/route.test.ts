import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation lib/portal/requireHost.test.mts and
// app/api/portal/profile/route.test.mts already documented. This test
// covers the one pure piece: an unauthenticated request never reaches
// Supabase writes.
test("POST /api/portal/tiger/roster rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/roster", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "cade-barone", team: "maroon" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
