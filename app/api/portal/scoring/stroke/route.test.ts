import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/stroke rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/stroke", {
    method: "POST",
    body: JSON.stringify({ round: 1, hole: 1, targetPlayerSlugs: ["cade-barone"], score: 4 }),
  });
  await assert.rejects(() => POST(request));
});
