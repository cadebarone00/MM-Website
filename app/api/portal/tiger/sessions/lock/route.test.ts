// app/api/portal/tiger/sessions/lock/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/sessions/lock rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/sessions/lock", {
    method: "POST",
    body: JSON.stringify({ session: 1, lock: "matchups", value: true }),
  });
  await assert.rejects(() => POST(request));
});
