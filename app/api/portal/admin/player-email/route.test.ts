import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation every other admin/** route test
// documents. This test covers the one pure piece: an unauthenticated
// request never touches Supabase.
test("POST /api/portal/admin/player-email rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/admin/player-email", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "cade-barone", email: "cade@example.com" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
