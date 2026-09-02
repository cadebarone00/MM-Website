import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/active-season rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/active-season", {
    method: "POST",
    body: JSON.stringify({ year: 2028 }),
  });
  await assert.rejects(() => POST(request));
});
