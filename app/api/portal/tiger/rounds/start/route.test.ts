// app/api/portal/tiger/rounds/start/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/rounds/start rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds/start", {
    method: "POST",
    body: JSON.stringify({ round: 1 }),
  });
  await assert.rejects(() => POST(request));
});
