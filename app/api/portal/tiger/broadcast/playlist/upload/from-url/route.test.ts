import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/upload/from-url rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/upload/from-url", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com/song.mp3", title: "Song", durationSeconds: 180 }),
  });
  await assert.rejects(() => POST(request));
});
