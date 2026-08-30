// app/api/portal/tiger/rounds/lock/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/rounds/lock rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds/lock", {
    method: "POST",
    body: JSON.stringify({ round: 1, lock: "matchups", value: true }),
  });
  await assert.rejects(() => POST(request));
});
