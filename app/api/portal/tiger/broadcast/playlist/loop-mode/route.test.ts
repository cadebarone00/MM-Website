import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/loop-mode rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/loop-mode", {
    method: "POST",
    body: JSON.stringify({ mode: "one" }),
  });
  await assert.rejects(() => POST(request));
});
