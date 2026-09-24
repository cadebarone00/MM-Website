import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/upload/confirm rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/upload/confirm", {
    method: "POST",
    body: JSON.stringify({ title: "Song", storagePath: "playlist/2027/abc.mp3", durationSeconds: 180 }),
  });
  await assert.rejects(() => POST(request));
});
