import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation every other tiger/** route test
// documents. This test covers the one pure piece: an unauthenticated
// request never creates a player or touches Supabase.
test("POST /api/portal/tiger/player-add rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/player-add", {
    method: "POST",
    body: JSON.stringify({ fullName: "Test Player", email: "test@example.com" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
