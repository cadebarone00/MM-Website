import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/delete rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/delete", {
    method: "POST",
    body: JSON.stringify({ trackId: "11111111-1111-1111-1111-111111111111" }),
  });
  await assert.rejects(() => POST(request));
});
