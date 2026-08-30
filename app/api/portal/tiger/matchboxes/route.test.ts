import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same documented limitation as every other Tiger
// Center route test. This covers the one pure piece: an unauthenticated
// request never reaches Supabase. Format-aware validation logic itself is
// covered directly against pure functions in lib/live/orchestration.test.ts.
test("POST /api/portal/tiger/matchboxes rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/matchboxes", {
    method: "POST",
    body: JSON.stringify({ round: 1, boxNumber: 1, teeTime: "2027-01-06T09:30:00-06:00", maroonPlayers: ["cam", "drew"], whitePlayers: ["cade", "collin"] }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
