import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/stats rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/stats", {
    method: "POST",
    body: JSON.stringify({ round: 1, hole: 1, putts: 2, fir: true, gir: true }),
  });
  await assert.rejects(() => POST(request));
});
