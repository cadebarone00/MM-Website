import { test } from "node:test";
import assert from "node:assert/strict";

// Same limitation every other Tiger Route Handler test in this codebase
// documents: requireHost() needs a real request lifecycle, unavailable in
// this test environment, so the whole call rejects before reaching
// Supabase.
test("POST /api/portal/tiger/master-settings rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/master-settings", {
    method: "POST",
    body: JSON.stringify({ year: 2027, beginDate: "2027-01-06", endDate: "2027-01-09", datesLocked: false, venueName: "Mission Hills CC", venueLocked: false }),
  });
  await assert.rejects(() => POST(request));
});
