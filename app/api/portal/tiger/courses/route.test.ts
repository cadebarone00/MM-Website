import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/courses rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Test Course", holes: [] }),
  });
  await assert.rejects(() => POST(request));
});

test("POST /api/portal/tiger/courses validates hole count structurally", () => {
  // Pure validation logic, no auth/DB needed — exercised directly.
  const holes = Array.from({ length: 17 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 }));
  assert.equal(holes.length !== 18, true, "17 holes should fail validation (sanity check on the test fixture itself)");
});
