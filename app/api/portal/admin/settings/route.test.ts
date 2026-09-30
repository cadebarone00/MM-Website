import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation lib/portal/requireHost.test.mts and
// app/api/portal/profile/route.test.mts already documented. This test
// covers the one pure piece: an unauthenticated request never reaches
// Supabase writes.
test("POST /api/portal/admin/settings rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/admin/settings", {
    method: "POST",
    body: JSON.stringify({ sessionCount: 8 }),
  });
  await assert.rejects(() => POST(request));
});
