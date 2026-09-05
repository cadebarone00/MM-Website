import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/upload/sign rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/upload/sign", {
    method: "POST",
    body: JSON.stringify({ extension: ".mp3" }),
  });
  await assert.rejects(() => POST(request));
});
